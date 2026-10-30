import 'server-only';
import { appOrigin } from './env';

export const rpName = 'CATC Business Directory';
export const rpID = () => new URL(appOrigin()).hostname;
export const expectedOrigin = () => appOrigin();
export const CHALLENGE_COOKIE = 'catc_webauthn';
