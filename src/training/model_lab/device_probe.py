import platform
import time


def probe_device():
    info = {
        "python_version": platform.python_version(),
        "torch_version": "",
        "cuda_available": False,
        "mps_available": False,
        "device": "cpu",
        "matmul_seconds": None,
        "tiny_forward_backward_seconds": None,
        "recommendation": {"context_length": 256, "batch_size": 4, "grad_accumulation": 1, "segment_token_cap": 8000000},
    }
    try:
        import torch

        info["torch_version"] = torch.__version__
        info["cuda_available"] = bool(torch.cuda.is_available())
        info["mps_available"] = bool(torch.backends.mps.is_available())
        if info["cuda_available"]:
            info["device"] = "cuda"
        elif info["mps_available"]:
            info["device"] = "mps"
        device = info["device"]
        a = torch.randn(256, 256, device=device)
        start = time.time()
        _ = a @ a
        if device != "cpu":
            torch.mps.synchronize() if device == "mps" else torch.cuda.synchronize()
        info["matmul_seconds"] = time.time() - start
        model = torch.nn.Sequential(torch.nn.Linear(128, 256), torch.nn.GELU(), torch.nn.Linear(256, 128)).to(device)
        x = torch.randn(16, 128, device=device)
        start = time.time()
        loss = model(x).pow(2).mean()
        loss.backward()
        if device != "cpu":
            torch.mps.synchronize() if device == "mps" else torch.cuda.synchronize()
        info["tiny_forward_backward_seconds"] = time.time() - start
        if device != "cpu":
            info["recommendation"] = {"context_length": 384, "batch_size": 8, "grad_accumulation": 1, "segment_token_cap": 15000000}
    except Exception as exc:
        info["probe_error"] = repr(exc)
    return info
