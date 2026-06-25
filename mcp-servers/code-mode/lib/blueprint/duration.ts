/** @file Parse authentik token-validity durations to seconds (for `cap`-binned attrs). */

/**
 * Parse an authentik token validity value, which can be:
 * - a number (seconds)
 * - a string like "hours=1" or "seconds=3600"
 *
 * Returns the number of seconds, or null if unparseable.
 */
export function parseTokenDuration(val: unknown): number | null {
    if (typeof val === "number") return val;

    if (typeof val === "string") {
        // authentik accepts timedelta strings like "hours=1;minutes=30"
        const match = /^(\d+)$/.exec(val.trim());
        if (match) return parseInt(match[1]!, 10);

        // Parse "key=value;key=value" style. Any unrecognized unit (or any
        // unparseable part) rejects the whole value — never silently ignore.
        let total = 0;
        let parsed = false;

        for (const part of val.split(";")) {
            if (part.trim() === "") continue; // tolerate trailing/empty segments
            const kv = /^\s*(\w+)\s*=\s*(\d+)\s*$/.exec(part.trim());
            if (!kv) return null;
            const [, unit, amount] = kv;
            parsed = true;
            const n = parseInt(amount!, 10);

            switch (unit) {
                case "seconds":
                    total += n;
                    break;
                case "minutes":
                    total += n * 60;
                    break;
                case "hours":
                    total += n * 3600;
                    break;
                case "days":
                    total += n * 86400;
                    break;
                case "weeks":
                    total += n * 604800;
                    break;
                default:
                    return null; // unknown unit → reject
            }
        }

        return parsed ? total : null;
    }

    return null;
}
