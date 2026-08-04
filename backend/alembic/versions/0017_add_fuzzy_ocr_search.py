"""add accent-insensitive fuzzy OCR search

Revision ID: 0017_fuzzy_ocr_search
Revises: 0016_cache_ocr_fingerprint
Create Date: 2026-08-01
"""

from alembic import op


revision = "0017_fuzzy_ocr_search"
down_revision = "0016_cache_ocr_fingerprint"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS unaccent;")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
    op.execute(
        """
        CREATE FUNCTION normalize_ocr_text(input_text text)
        RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        RETURNS NULL ON NULL INPUT
        AS $$
            SELECT btrim(
                regexp_replace(
                    lower(
                        public.unaccent(
                            'public.unaccent'::regdictionary,
                            input_text
                        )
                    ),
                    '[^[:alnum:]]+',
                    ' ',
                    'g'
                )
            )
        $$;
        """
    )
    op.execute(
        """
        ALTER TABLE ocr_texts
        ADD COLUMN normalized_text text
        GENERATED ALWAYS AS (normalize_ocr_text(raw_text)) STORED;
        """
    )
    op.execute(
        """
        CREATE INDEX ix_ocr_texts_normalized_trgm
        ON ocr_texts USING gin (normalized_text gin_trgm_ops);
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_ocr_texts_normalized_trgm;")
    op.execute("ALTER TABLE ocr_texts DROP COLUMN IF EXISTS normalized_text;")
    op.execute("DROP FUNCTION IF EXISTS normalize_ocr_text(text);")
    # Extensions are intentionally retained because another feature may use them.
