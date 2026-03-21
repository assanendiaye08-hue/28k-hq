/**
 * Data Privacy Module Constants
 *
 * Configuration values for /mydata export and /deletedata deletion commands.
 */

/** Version number embedded in JSON export for future format compatibility. */
export const EXPORT_VERSION = 1;

/** Timeout in ms for the user to confirm deletion by typing DELETE. */
export const DELETE_CONFIRMATION_TIMEOUT_MS = 30 * 1000;

/** The exact word the user must type to confirm data deletion. */
export const DELETE_CONFIRMATION_WORD = 'DELETE';

/** Prefix for the exported JSON filename. */
export const EXPORT_FILENAME_PREFIX = 'mydata';
