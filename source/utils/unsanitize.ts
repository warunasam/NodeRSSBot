import { htmlUnescape } from 'escape-goat';

// escape and clean up text to send in telegram
export default function (s: string): string {
    return htmlUnescape(
        s
            .trim()
            .replace(/<br\s*[\/]?>/gi, "\n")
    );
}
