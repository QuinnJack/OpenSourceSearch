const RAW_BASE_URL = import.meta.env?.BASE_URL ?? "/";
const NORMALIZED_BASE_URL = RAW_BASE_URL.endsWith("/") ? RAW_BASE_URL : `${RAW_BASE_URL}/`;

export const FORENSICS_BASE_PATH = `${NORMALIZED_BASE_URL}photo-forensics`;
export const FORENSICS_STATIC_PATH = `${FORENSICS_BASE_PATH}/static`;
