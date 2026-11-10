# Scanner model

`mobilenet_v2_0.35_224/` is Google's MobileNetV2 (width 0.35, 224 px, ImageNet weights, no classification head),
converted for TensorFlow.js and published by Google for Teachable Machine
(`storage.googleapis.com/teachable-machine-models/mobilenet_v2_weights_tf_dim_ordering_tf_kernels_0.35_224_no_top/`).
Licence: Apache-2.0.

The app downloads it once (about 1.7 MB) when you first use **Scan & teach**, keeps it on the phone, and uses it only to
turn camera views into visual fingerprints locally. SHA-256:

- `model.json` 743ac7298e845e2c2ef2c361cb2dad84b8bfc67ccbef1fefc20146d529b17030
- `group1-shard1of1.bin` d366835afb87a9a6915084f00635339c2c8e137760cd891ab234340194ca1913
