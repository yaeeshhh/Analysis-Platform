from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..deps import get_current_user
from ...core.config import settings
from ...core.database import get_db
from ...models.user import User
from ...schemas.auth import (
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GenerateRememberTokenResponse,
    IdentifierCheckRequest,
    IdentifierCheckResponse,
    LoginChallengeResponse,
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    RefreshRequest,
    RefreshResponse,
    RememberLoginRequest,
    RequestAccountDeletionCodeResponse,
    RequestProfileIdentityUpdateCodeRequest,
    RequestProfileIdentityUpdateCodeResponse,
    ResetPasswordContextResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    SendAccountDeletionCodeRequest,
    SendAccountDeletionCodeResponse,
    SendLoginCodeRequest,
    SendLoginCodeResponse,
    SendProfileIdentityUpdateCodeRequest,
    SendProfileIdentityUpdateCodeResponse,
    SignupAvailabilityRequest,
    SignupAvailabilityResponse,
    UpdateProfileRequest,
    UserResponse,
    VerifyAccountDeletionCodeRequest,
    VerifyLoginCodeRequest,
    VerifyProfileIdentityUpdateCodeRequest,
)
from ...schemas.pending_signup import (
    PendingSignupRequest,
    PendingSignupStartResponse,
    SendSignupCodeRequest,
    SendSignupCodeResponse,
    VerifySignupCodeRequest,
)
from ...services.auth_service import AuthService
from ...services.pending_signup_service import PendingSignupService

router = APIRouter(prefix="/auth", tags=["auth"])


def _seconds_until(expires_at: datetime) -> int:
    now = datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    return max(0, int((expires_at - now).total_seconds()))


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        full_name=user.full_name,
        date_of_birth=user.date_of_birth.isoformat() if user.date_of_birth else None,
        two_factor_enabled=user.two_factor_enabled,
        is_active=user.is_active,
        created_at=user.created_at.isoformat(),
    )


@router.post("/signup/start", response_model=PendingSignupStartResponse)
def start_signup(payload: PendingSignupRequest, db: Session = Depends(get_db)):
    pending = PendingSignupService.create_pending_signup(
        payload.email,
        payload.username,
        payload.password,
        db,
        full_name=payload.full_name,
    )

    return PendingSignupStartResponse(
        challenge_token=pending.raw_challenge_token,
        email=pending.email,
        code_sent=False,
        expires_in_seconds=_seconds_until(pending.expires_at),
        resend_available_in_seconds=0,
    )


@router.post("/signup/send-code", response_model=SendSignupCodeResponse)
def send_signup_code(payload: SendSignupCodeRequest, db: Session = Depends(get_db)):
    pending = PendingSignupService.send_signup_code(payload.challenge_token, db)

    return SendSignupCodeResponse(
        challenge_token=payload.challenge_token,
        email=pending.email,
        code_sent=True,
        expires_in_seconds=_seconds_until(pending.expires_at),
        resend_available_in_seconds=settings.LOGIN_VERIFICATION_RESEND_COOLDOWN_SECONDS,
    )


@router.post("/signup/verify", response_model=LoginResponse)
def verify_signup_code(
    payload: VerifySignupCodeRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    pending = PendingSignupService.verify_signup_code(
        payload.challenge_token,
        payload.code,
        db,
    )

    user = User(
        email=pending.email,
        username=pending.username,
        full_name=pending.full_name,
        two_factor_enabled=True,
        password_hash=pending.password_hash,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token, refresh_token, remember_token = AuthService._issue_login_artifacts(
        user,
        db,
        remember_me=False,
    )

    PendingSignupService.delete_pending_signup_by_challenge(
        payload.challenge_token,
        db,
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/",
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        remember_token=remember_token,
        user=_user_response(user),
    )


@router.post("/login", response_model=LoginResponse | LoginChallengeResponse)
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user = AuthService.authenticate_login_user(payload.identifier, payload.password, db)

    response.delete_cookie(
        key="refresh_token",
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )

    if not user.two_factor_enabled:
        access_token, refresh_token, remember_token = AuthService._issue_login_artifacts(
            user,
            db,
            remember_me=payload.remember_me,
        )

        response.set_cookie(
            key="refresh_token",
            value=refresh_token,
            httponly=True,
            secure=settings.COOKIE_SECURE,
            samesite=settings.COOKIE_SAMESITE,
            max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
            path="/",
        )

        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            remember_token=remember_token,
            user=_user_response(user),
        )

    challenge_token, expires_at = AuthService._create_login_verification(
        user,
        db,
        remember_me=payload.remember_me,
    )

    expires_in_seconds = _seconds_until(expires_at)

    return LoginChallengeResponse(
        challenge_token=challenge_token,
        email=user.email,
        code_sent=False,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=0,
    )


@router.post("/send-login-code", response_model=SendLoginCodeResponse)
def send_login_code(
    payload: SendLoginCodeRequest,
    db: Session = Depends(get_db),
):
    user, _expires_at, resend_available_in_seconds = AuthService.send_login_code(
        payload.challenge_token,
        db,
    )

    expires_in_seconds = settings.LOGIN_VERIFICATION_EXPIRE_MINUTES * 60

    return SendLoginCodeResponse(
        challenge_token=payload.challenge_token,
        email=user.email,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=resend_available_in_seconds,
    )


@router.post("/verify-login-code", response_model=LoginResponse)
def verify_login_code(
    payload: VerifyLoginCodeRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user, access_token, refresh_token, remember_token = AuthService.verify_login_code(
        payload.challenge_token,
        payload.code,
        db,
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/",
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        remember_token=remember_token,
        user=_user_response(user),
    )


@router.post("/remember-login", response_model=LoginResponse)
def remember_login(
    payload: RememberLoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user, access_token, refresh_token, remember_token = (
        AuthService.login_with_remember_token(
            payload.email,
            payload.remember_token,
            db,
        )
    )

    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/",
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        remember_token=remember_token,
        user=_user_response(user),
    )


@router.post("/me/generate-remember-token", response_model=GenerateRememberTokenResponse)
def generate_remember_token(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    remember_token = AuthService.generate_remember_token(current_user, db)
    return GenerateRememberTokenResponse(remember_token=remember_token)


@router.post("/check-identifier", response_model=IdentifierCheckResponse)
def check_identifier(
    payload: IdentifierCheckRequest,
    db: Session = Depends(get_db),
):
    exists, email = AuthService.resolve_login_identifier(payload.identifier, db)
    return IdentifierCheckResponse(exists=exists, email=email)


@router.post("/check-signup-availability", response_model=SignupAvailabilityResponse)
def check_signup_availability(
    payload: SignupAvailabilityRequest,
    db: Session = Depends(get_db),
):
    email_exists, username_exists = AuthService.check_signup_availability(
        payload.email,
        payload.username,
        db,
    )
    return SignupAvailabilityResponse(
        email_exists=email_exists,
        username_exists=username_exists,
    )


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
def forgot_password(
    payload: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    reset_link = AuthService.request_password_reset(
        payload.email,
        db,
        redirect_path=payload.redirect_path,
        frontend_origin=payload.frontend_origin,
    )
    return ForgotPasswordResponse(
        message="If an account exists for this email, a reset link has been sent.",
        reset_link=reset_link,
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
def reset_password(
    payload: ResetPasswordRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    AuthService.reset_password(payload.token, payload.new_password, db)
    response.delete_cookie(
        key="refresh_token",
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )
    return ResetPasswordResponse(message="Password reset successful")


@router.get("/reset-password-context", response_model=ResetPasswordContextResponse)
def reset_password_context(
    token: str,
    db: Session = Depends(get_db),
):
    email, username = AuthService.get_password_reset_context(token, db)
    return ResetPasswordContextResponse(email=email, username=username)


@router.post("/refresh", response_model=RefreshResponse)
def refresh(
    refresh_request: RefreshRequest | None = None,
    refresh_token_cookie: str | None = Cookie(default=None, alias="refresh_token"),
    db: Session = Depends(get_db),
):
    refresh_token = (
        refresh_request.refresh_token if refresh_request else None
    ) or refresh_token_cookie

    if not refresh_token:
        raise HTTPException(status_code=401, detail="Refresh token required")

    try:
        new_access_token, new_refresh_token = AuthService.refresh_access_token(
            refresh_token,
            db,
        )
    except HTTPException as exc:
        if exc.status_code != 401:
            raise

        json_response = JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
        json_response.delete_cookie(
            key="refresh_token",
            path="/",
            samesite=settings.COOKIE_SAMESITE,
            secure=settings.COOKIE_SECURE,
        )
        return json_response

    response_data = RefreshResponse(
        access_token=new_access_token,
        token_type="bearer",
    )

    json_response = JSONResponse(response_data.model_dump())
    json_response.set_cookie(
        key="refresh_token",
        value=new_refresh_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_EXPIRE_SECONDS,
        path="/",
    )

    return json_response


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.put("/me", response_model=UserResponse)
def update_current_user_info(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated_user = AuthService.update_profile(
        user=current_user,
        db=db,
        email=payload.email,
        username=payload.username,
        full_name=payload.full_name,
        date_of_birth=payload.date_of_birth,
        two_factor_enabled=payload.two_factor_enabled,
        password=payload.password,
        current_password=payload.current_password,
    )

    return _user_response(updated_user)


@router.post(
    "/me/request-profile-update-code",
    response_model=RequestProfileIdentityUpdateCodeResponse,
)
def request_profile_identity_update_code(
    payload: RequestProfileIdentityUpdateCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    challenge_token, email, expires_in_seconds, resend_available_in_seconds = (
        AuthService.request_profile_identity_update_code(
            current_user,
            db,
            payload.email,
            payload.username,
        )
    )
    return RequestProfileIdentityUpdateCodeResponse(
        challenge_token=challenge_token,
        email=email,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=resend_available_in_seconds,
    )


@router.post(
    "/me/send-profile-update-code",
    response_model=SendProfileIdentityUpdateCodeResponse,
)
def send_profile_identity_update_code(
    payload: SendProfileIdentityUpdateCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    email, _expires_at, resend_available_in_seconds = (
        AuthService.send_profile_identity_update_code(
            current_user,
            payload.challenge_token,
            db,
        )
    )

    expires_in_seconds = settings.LOGIN_VERIFICATION_EXPIRE_MINUTES * 60

    return SendProfileIdentityUpdateCodeResponse(
        challenge_token=payload.challenge_token,
        email=email,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=resend_available_in_seconds,
    )


@router.post("/me/verify-profile-update-code", response_model=UserResponse)
def verify_profile_identity_update_code(
    payload: VerifyProfileIdentityUpdateCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated_user = AuthService.verify_profile_identity_update_code(
        current_user,
        payload.challenge_token,
        payload.code,
        db,
    )
    return _user_response(updated_user)


@router.post(
    "/me/request-account-deletion-code",
    response_model=RequestAccountDeletionCodeResponse,
)
def request_account_deletion_code(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    challenge_token, email, expires_in_seconds, resend_available_in_seconds = (
        AuthService.request_account_deletion_code(current_user, db)
    )
    return RequestAccountDeletionCodeResponse(
        challenge_token=challenge_token,
        email=email,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=resend_available_in_seconds,
    )


@router.post(
    "/me/send-account-deletion-code",
    response_model=SendAccountDeletionCodeResponse,
)
def send_account_deletion_code(
    payload: SendAccountDeletionCodeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    email, _expires_at, resend_available_in_seconds = (
        AuthService.send_account_deletion_code(
            current_user,
            payload.challenge_token,
            db,
        )
    )

    expires_in_seconds = settings.LOGIN_VERIFICATION_EXPIRE_MINUTES * 60

    return SendAccountDeletionCodeResponse(
        challenge_token=payload.challenge_token,
        email=email,
        expires_in_seconds=expires_in_seconds,
        resend_available_in_seconds=resend_available_in_seconds,
    )


@router.post("/me/verify-account-deletion-code", response_model=LogoutResponse)
def verify_account_deletion_code(
    payload: VerifyAccountDeletionCodeRequest,
    response: Response,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuthService.verify_account_deletion_code(
        current_user,
        payload.challenge_token,
        payload.code,
        db,
    )

    result = JSONResponse({"message": "Account deleted successfully"})
    result.delete_cookie(
        key="refresh_token",
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )

    return result


@router.post("/logout", response_model=LogoutResponse)
def logout(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    AuthService.logout(current_user.id, db)

    response = JSONResponse({"message": "Logged out successfully"})
    response.delete_cookie(
        key="refresh_token",
        path="/",
        samesite=settings.COOKIE_SAMESITE,
        secure=settings.COOKIE_SECURE,
    )

    return response