from fastapi import Depends, HTTPException, Header
from jose import JWTError
from sqlalchemy.orm import Session

from ..core.database import get_db
from ..core.security import (
    PASSWORD_CHANGED_REAUTH_DETAIL,
    decode_token,
    verify_token_type,
    verify_token_freshness,
    was_token_issued_before,
)
from ..models.user_security_state import UserSecurityState
from ..models.user import User


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    """Dependency to get current authenticated user from Bearer token.
    
    Expects Authorization header: "Bearer <access_token>"
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Not authenticated")

    # Parse Bearer token
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = parts[1]

    try:
        payload = decode_token(token)

        # Verify token type is access token
        if not verify_token_type(payload, "access"):
            raise HTTPException(status_code=401, detail="Invalid token type")

        if not verify_token_freshness(payload):
            raise HTTPException(
                status_code=401,
                detail="Session expired after server restart. Please log in again.",
            )

        user_id = payload.get("sub")

        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == int(user_id)).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="User account is inactive")

    security_state = (
        db.query(UserSecurityState)
        .filter(UserSecurityState.user_id == user.id)
        .first()
    )
    if security_state and was_token_issued_before(payload, security_state.password_changed_at):
        raise HTTPException(status_code=401, detail=PASSWORD_CHANGED_REAUTH_DETAIL)

    return user
