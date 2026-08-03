"""cache OCR results by image and engine fingerprint

Revision ID: 0016_cache_ocr_fingerprint
Revises: 0015_split_semantic_ocr
Create Date: 2026-08-01
"""

from alembic import op
import sqlalchemy as sa


revision = "0016_cache_ocr_fingerprint"
down_revision = "0015_split_semantic_ocr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "ocr_texts",
        sa.Column("source_checksum", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "ocr_texts",
        sa.Column("engine_signature", sa.String(length=255), nullable=True),
    )
    op.create_index(
        "ix_ocr_texts_cache_fingerprint",
        "ocr_texts",
        ["source_checksum", "engine_signature"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ocr_texts_cache_fingerprint", table_name="ocr_texts")
    op.drop_column("ocr_texts", "engine_signature")
    op.drop_column("ocr_texts", "source_checksum")
