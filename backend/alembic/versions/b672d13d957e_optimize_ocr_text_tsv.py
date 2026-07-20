"""optimize_ocr_text_tsv

Revision ID: b672d13d957e
Revises: 0004_increase_path_len
Create Date: 2026-07-20 06:54:56.068372
"""
from alembic import op
import sqlalchemy as sa


revision = 'b672d13d957e'
down_revision = '0004_increase_path_len'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Update existing rows
    op.execute("UPDATE ocr_texts SET tsv = to_tsvector('simple', coalesce(raw_text, ''))")
    
    # Create the trigger
    op.execute("""
        CREATE TRIGGER tsvectorupdate BEFORE INSERT OR UPDATE
        ON ocr_texts FOR EACH ROW EXECUTE FUNCTION
        tsvector_update_trigger(tsv, 'pg_catalog.simple', raw_text);
    """)


def downgrade() -> None:
    # Drop the trigger
    op.execute("DROP TRIGGER IF EXISTS tsvectorupdate ON ocr_texts")
    
    # Nullify existing rows
    op.execute("UPDATE ocr_texts SET tsv = NULL")
