import type { AlertProvider } from './types';
import { badgesAlertProvider } from './providers/badges-alert-provider';

export const ALERT_PROVIDERS: AlertProvider[] = [badgesAlertProvider];

