from backend.main import app
from backend.settings import get_settings


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run("backend.main:app", host=settings.vox_host, port=settings.vox_port)

