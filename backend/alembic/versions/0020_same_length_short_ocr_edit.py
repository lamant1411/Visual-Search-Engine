"""prefer same-length OCR corrections for short query precision

Revision ID: 0020_same_length_ocr
Revises: 0019_private_user_batches
Create Date: 2026-08-06
"""

from alembic import op


revision = "0020_same_length_ocr"
down_revision = "0019_private_user_batches"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        r"""
        CREATE FUNCTION ocr_min_same_length_token_edit_distance(
            query_text text,
            document_text text,
            max_distance integer
        )
        RETURNS integer
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        RETURNS NULL ON NULL INPUT
        AS $$
            SELECT COALESCE(
                min(
                    public.levenshtein_less_equal(
                        left(token, 255),
                        left(query_text, 255),
                        max_distance
                    )
                ),
                max_distance + 1
            )
            FROM regexp_split_to_table(document_text, '\s+') AS token
            WHERE length(token) = length(query_text)
        $$;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION IF EXISTS
            ocr_min_same_length_token_edit_distance(text, text, integer);
        """
    )
