"""Add full_name to users for auth registration."""

from alembic import op
import sqlalchemy as sa


revision = "0003_add_full_name_to_users"
down_revision = "0002_add_username_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("full_name", sa.String(length=255), nullable=True))
    op.execute("UPDATE users SET full_name = email WHERE full_name IS NULL")
    op.alter_column("users", "full_name", nullable=False)


def downgrade() -> None:
    op.drop_column("users", "full_name")
