"""
services/storage.py — AWS S3 operations.

Uses boto3 with the "sourcely" AWS profile (set via AWS_PROFILE env var
or passed explicitly to boto3.Session). This avoids hardcoding credentials
and lets the developer manage keys through ~/.aws/credentials.
"""

import os
import logging
import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

BUCKET_NAME = os.getenv("AWS_S3_BUCKET", "sourcely-axtex-bucket")
AWS_PROFILE = os.getenv("AWS_PROFILE", "sourcely")
AWS_REGION = os.getenv("AWS_REGION", "us-west-2")


def _get_s3_client():
    """
    Create an S3 client.

    Local dev: uses the named AWS profile from ~/.aws/credentials.
    Railway / Lambda: AWS_PROFILE is unset so boto3 falls back to
    AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY environment variables,
    which Railway injects automatically.
    """
    if AWS_PROFILE:
        session = boto3.Session(profile_name=AWS_PROFILE, region_name=AWS_REGION)
    else:
        # No profile — rely on env vars (Railway) or IAM role (Lambda)
        session = boto3.Session(region_name=AWS_REGION)
    return session.client("s3")


def upload_to_s3(file_bytes: bytes, filename: str, document_id: str) -> str:
    """
    Upload a PDF to S3.

    Key format: documents/{document_id}/{filename}
    Returns the S3 key so it can be stored in the DB.
    """
    s3_key = f"documents/{document_id}/{filename}"
    s3 = _get_s3_client()

    try:
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=file_bytes,
            ContentType="application/pdf",
        )
        logger.info(f"Uploaded {filename} → s3://{BUCKET_NAME}/{s3_key}")
        return s3_key
    except ClientError as e:
        logger.error(f"S3 upload failed for {filename}: {e}")
        raise


def download_from_s3(s3_key: str) -> bytes:
    """
    Download a file from S3 and return its raw bytes.
    Used by the processor to fetch a PDF before extracting text.
    """
    s3 = _get_s3_client()

    try:
        response = s3.get_object(Bucket=BUCKET_NAME, Key=s3_key)
        data = response["Body"].read()
        logger.info(f"Downloaded {len(data):,} bytes from s3://{BUCKET_NAME}/{s3_key}")
        return data
    except ClientError as e:
        logger.error(f"S3 download failed for {s3_key}: {e}")
        raise


def delete_from_s3(s3_key: str):
    """Delete an object from S3 (called when a document is deleted)."""
    s3 = _get_s3_client()

    try:
        s3.delete_object(Bucket=BUCKET_NAME, Key=s3_key)
        logger.info(f"Deleted s3://{BUCKET_NAME}/{s3_key}")
    except ClientError as e:
        logger.error(f"S3 delete failed for {s3_key}: {e}")
        raise


def generate_presigned_url(s3_key: str, expires: int = 3600) -> str:
    """
    Generate a temporary pre-signed URL that allows direct browser download
    without exposing credentials. Useful for day-2 file preview features.
    """
    s3 = _get_s3_client()

    try:
        url = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": BUCKET_NAME, "Key": s3_key},
            ExpiresIn=expires,
        )
        return url
    except ClientError as e:
        logger.error(f"Pre-signed URL generation failed for {s3_key}: {e}")
        raise
