from pydantic import BaseModel, EmailStr


class PendingSignupRequest(BaseModel):
    email: EmailStr
    username: str
    full_name: str | None = None
    password: str


class PendingSignupStartResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool
    expires_in_seconds: int
    resend_available_in_seconds: int


class SendSignupCodeRequest(BaseModel):
    challenge_token: str


class SendSignupCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool
    expires_in_seconds: int
    resend_available_in_seconds: int


class VerifySignupCodeRequest(BaseModel):
    challenge_token: str
    code: str