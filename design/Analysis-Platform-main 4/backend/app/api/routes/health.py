from fastapi import APIRouter

router = APIRouter()


@router.get("/")
def root():
    return {
        "message": "Analysis Studio API is running",
    }


@router.get("/health")
def health():
    return {"status": "ok"}