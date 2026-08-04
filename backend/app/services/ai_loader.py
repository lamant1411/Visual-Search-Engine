import sys
from pathlib import Path

# Trong Docker container, AI module được copy vào /ai
# Khi chạy local, tìm thư mục AI ở project root
AI_CONTAINER_PATH = Path("/ai")
AI_LOCAL_PATH = Path(__file__).resolve().parent.parent.parent.parent / "AI"

if AI_CONTAINER_PATH.exists():
    ai_dir = str(AI_CONTAINER_PATH)
elif AI_LOCAL_PATH.exists():
    ai_dir = str(AI_LOCAL_PATH)
else:
    ai_dir = None

if ai_dir and ai_dir not in sys.path:
    sys.path.append(ai_dir)

clip_embedder_instance = None

def get_clip_embedder():
    global clip_embedder_instance
    if clip_embedder_instance is None:
        from clip_module import CLIPEmbedder
        clip_embedder_instance = CLIPEmbedder()
    return clip_embedder_instance
