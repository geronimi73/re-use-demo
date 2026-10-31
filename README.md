# RE-USE WebGPU demo

Speech enhancement in the browser with [NVIDIA NemotronLabs RE-USE](https://huggingface.co/nvidia/NVIDIA-NemotronLabs-RE-USE), a 9.6M-parameter model that removes noise, echo and bad-mic sound. The model runs on the GPU through hand-written WebGPU kernels. No ONNX runtime, no server, the audio never leaves the browser.

Live: [re-use-demo.geronimo-labs.com](https://re-use-demo.geronimo-labs.com)

https://github.com/user-attachments/assets/c87fd415-0570-4b1b-bb19-b0ed6b591a3e

Opus 5.5 wrote the WebGPU inference code. Process: 
 * Reproduce inference with original safetensors + plain torch
 * Convert to .onnx
 * Run with Python onnxruntime, make sure output is the same
 * Run with onnxruntime-node on WebGPU, superslow. Claude writes custom kernels, about 0.5 s for 2 s of audio on an M3 macbook, output matches
 * Build vite+react frontend

The RE-USE model and its weights are NVIDIA's, under OpenMDW-1.1 (`src/model-license.txt`).
