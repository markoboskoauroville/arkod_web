// /api/wfs?... → the state's cadastral WFS (parcel outlines as GeoJSON), with CORS.
import { forward, TARGETS, queryOf } from '../_proxy.js';

export const onRequest = ({ request }) => forward(request, 'wfs', TARGETS.wfs + queryOf(request));
