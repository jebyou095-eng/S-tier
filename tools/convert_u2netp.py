#!/usr/bin/env python3
"""Convert the U²-Net-p ONNX model (salient-object segmentation, Apache-2.0, by Xuebin Qin et al.;
ONNX export from the rembg project) into a tiny op list + float16 weights that js/cutout.js runs
with TensorFlow.js. BatchNorm is already folded into the convolutions in this export.

Usage: python3 tools/convert_u2netp.py u2netp.onnx data/ml/u2netp
"""
import json
import sys
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper


def main(src, dest):
    m = onnx.load(src)
    g = m.graph
    init = {t.name: numpy_helper.to_array(t) for t in g.initializer}
    producer = {o: n for n in g.node for o in n.output}
    attrs = lambda n: {a.name: onnx.helper.get_attribute_value(a) for a in n.attribute}

    def shape_source(name):
        """Follow a Resize 'sizes' input back to the tensor whose Shape() it copies."""
        seen = [name]
        while seen:
            t = seen.pop()
            n = producer.get(t)
            if n is None:
                continue
            if n.op_type == 'Shape':
                return n.input[0]
            seen.extend(n.input)
        raise ValueError(name)

    ops, weights, offset = [], [], 0
    ids = {}
    tid = lambda name: ids.setdefault(name, len(ids))
    tid(g.input[0].name)

    def add_w(arr):
        nonlocal offset
        a = arr.astype(np.float16).ravel()
        weights.append(a)
        start = offset
        offset += a.size
        return [start, a.size]

    for n in g.node:
        a = attrs(n)
        if n.op_type == 'Conv':
            w = init[n.input[1]]  # [out, in, kh, kw]
            b = init[n.input[2]] if len(n.input) > 2 else np.zeros(w.shape[0], np.float32)
            assert a.get('group', 1) == 1 and a['strides'] == [1, 1]
            hwio = np.transpose(w, (2, 3, 1, 0))  # TF wants [kh, kw, in, out]
            ops.append({'op': 'conv', 'x': tid(n.input[0]), 'y': tid(n.output[0]), 'shape': list(hwio.shape),
                        'w': add_w(hwio), 'b': add_w(b), 'd': a['dilations'][0], 'p': a['pads'][0]})
        elif n.op_type in ('Relu', 'Sigmoid'):
            ops.append({'op': n.op_type.lower(), 'x': tid(n.input[0]), 'y': tid(n.output[0])})
        elif n.op_type == 'MaxPool':
            assert a['kernel_shape'] == [2, 2] and a['strides'] == [2, 2] and a['ceil_mode'] == 1
            ops.append({'op': 'pool', 'x': tid(n.input[0]), 'y': tid(n.output[0])})
        elif n.op_type == 'Resize':
            assert a['mode'] == b'linear' and a['coordinate_transformation_mode'] == b'pytorch_half_pixel'
            ops.append({'op': 'resize', 'x': tid(n.input[0]), 'like': tid(shape_source(n.input[3])), 'y': tid(n.output[0])})
        elif n.op_type == 'Concat':
            if all(i in ids for i in n.input):  # a feature-map concat (shape concats are skipped)
                assert a['axis'] == 1
                ops.append({'op': 'concat', 'xs': [tid(i) for i in n.input], 'y': tid(n.output[0])})
        elif n.op_type == 'Add':
            if all(i in ids for i in n.input):
                ops.append({'op': 'add', 'xs': [tid(i) for i in n.input], 'y': tid(n.output[0])})
        elif n.op_type in ('Constant', 'Shape', 'Gather', 'Unsqueeze', 'Slice', 'Cast'):
            continue  # size bookkeeping for Resize, handled by 'like'
        else:
            raise ValueError(n.op_type)

    out = tid(g.output[0].name)  # d0: the fused, most accurate mask
    # Keep only what the main output needs.
    need, keep = {out}, []
    for o in reversed(ops):
        if o['y'] in need:
            keep.append(o)
            need.update(o.get('xs', []) or [o['x']])
            if 'like' in o:
                need.add(o['like'])
    keep.reverse()
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    blob = np.concatenate(weights).astype('<f2').tobytes()
    (dest / 'weights.bin').write_bytes(blob)
    (dest / 'model.json').write_text(json.dumps({'format': 'pocket-stats-oplist-1', 'input': 0, 'output': out,
                                                  'ops': keep, 'dtype': 'float16'}, separators=(',', ':')))
    print(f'{len(keep)} ops, {len(blob) / 1e6:.2f} MB weights')


if __name__ == '__main__':
    main(*sys.argv[1:3])
