"""add albums

Revision ID: 0022_add_albums
Revises: 0021_user_library_perf
Create Date: 2026-08-09
"""

from alembic import op
import sqlalchemy as sa


revision = "0022_add_albums"
down_revision = "0021_user_library_perf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "albums",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("owner_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("cover_image_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["cover_image_id"], ["images.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_albums_owner_deleted_updated_id", "albums", ["owner_user_id", "deleted_at", "updated_at", "id"], unique=False)

    op.create_table(
        "album_images",
        sa.Column("album_id", sa.Integer(), nullable=False),
        sa.Column("image_id", sa.Integer(), nullable=False),
        sa.Column("added_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["album_id"], ["albums.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("album_id", "image_id"),
    )
    op.create_index("ix_album_images_image_id", "album_images", ["image_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_album_images_image_id", table_name="album_images")
    op.drop_table("album_images")
    op.drop_index("ix_albums_owner_deleted_updated_id", table_name="albums")
    op.drop_table("albums")
