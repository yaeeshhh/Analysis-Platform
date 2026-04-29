from datetime import date

from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    full_name: str | None = Field(default=None, max_length=200)
    password: str = Field(..., min_length=8, description="Password must be at least 8 characters")


class LoginRequest(BaseModel):
    identifier: str  # accepts email or username
    password: str
    remember_me: bool = False


class UserResponse(BaseModel):
    id: int
    email: str
    username: str | None
    full_name: str | None = None
    date_of_birth: str | None = None
    two_factor_enabled: bool = True
    is_active: bool
    created_at: str

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    requires_2fa: bool = False
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    remember_token: str | None = None


class LoginChallengeResponse(BaseModel):
    requires_2fa: bool = True
    challenge_token: str
    email: EmailStr
    code_sent: bool = False
    expires_in_seconds: int
    resend_available_in_seconds: int = 0


class SendLoginCodeRequest(BaseModel):
    challenge_token: str


class SendLoginCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool = True
    expires_in_seconds: int
    resend_available_in_seconds: int


class VerifyLoginCodeRequest(BaseModel):
    challenge_token: str
    code: str = Field(..., min_length=6, max_length=6)


class RememberLoginRequest(BaseModel):
    email: EmailStr
    remember_token: str


class GenerateRememberTokenResponse(BaseModel):
    remember_token: str


class IdentifierCheckRequest(BaseModel):
    identifier: str


class IdentifierCheckResponse(BaseModel):
    exists: bool
    email: EmailStr | None = None


class SignupAvailabilityRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, max_length=100)


class SignupAvailabilityResponse(BaseModel):
    email_exists: bool = False
    username_exists: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str | None = None  # Can also come from cookie


class RefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UpdateProfileRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, max_length=100)
    full_name: str | None = Field(default=None, max_length=200)
    date_of_birth: date | None = None
    two_factor_enabled: bool | None = None
    password: str | None = Field(default=None, min_length=8)
    current_password: str | None = None


class RequestProfileIdentityUpdateCodeRequest(BaseModel):
    email: EmailStr | None = None
    username: str | None = Field(default=None, max_length=100)


class RequestProfileIdentityUpdateCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool = False
    expires_in_seconds: int
    resend_available_in_seconds: int = 0


class SendProfileIdentityUpdateCodeRequest(BaseModel):
    challenge_token: str


class SendProfileIdentityUpdateCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool = True
    expires_in_seconds: int
    resend_available_in_seconds: int


class VerifyProfileIdentityUpdateCodeRequest(BaseModel):
    challenge_token: str
    code: str = Field(..., min_length=6, max_length=6)


class RequestAccountDeletionCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool = False
    expires_in_seconds: int
    resend_available_in_seconds: int = 0


class SendAccountDeletionCodeRequest(BaseModel):
    challenge_token: str


class SendAccountDeletionCodeResponse(BaseModel):
    challenge_token: str
    email: EmailStr
    code_sent: bool = True
    expires_in_seconds: int
    resend_available_in_seconds: int


class VerifyAccountDeletionCodeRequest(BaseModel):
    challenge_token: str
    code: str = Field(..., min_length=6, max_length=6)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    redirect_path: str | None = None
    frontend_origin: str | None = None


class ForgotPasswordResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class ResetPasswordResponse(BaseModel):
    message: str


class ResetPasswordContextRequest(BaseModel):
    token: str


class ResetPasswordContextResponse(BaseModel):
    email: EmailStr
    username: str | None = None


class LogoutResponse(BaseModel):
    message: str


# Force Pydantic v2 to resolve all forward references in the correct namespace.
# Required because FastAPI rebuilds union response_model types (e.g. LoginResponse |
# LoginChallengeResponse) in a fresh namespace where UserResponse is not visible.
LoginResponse.model_rebuild()
LoginChallengeResponse.model_rebuild()
