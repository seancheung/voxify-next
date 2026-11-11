import { Mime } from "mime";
import otherTypes from "mime/types/other.js";
import standardTypes from "mime/types/standard.js";

// The default mime singleton picks "mpga" as the primary extension for
// audio/mpeg, but our audio pipeline needs ".mp3". The default export is
// frozen, so we build a fresh instance from the same type maps and override
// audio/mpeg → mp3 with `force: true`.
const mime = new Mime(standardTypes, otherTypes);
mime.define({ "audio/mpeg": ["mp3"] }, true);

export default mime;
