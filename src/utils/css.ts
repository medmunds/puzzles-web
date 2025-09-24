// CSS that needs to be shared between various shadow DOMs
import { css } from "lit";

/**
 * Change default wa-button appearance for compatibility with form controls.
 * (Outlined and filled similar to wa-input.)
 */
export const cssDefaultButtonStyle = css`
  wa-button[appearance="accent"][variant="neutral"] {
    --wa-color-fill-loud:  var(--wa-form-control-background-color);
    --wa-color-on-loud: var(--wa-form-control-label-color);
    &::part(base) {
      border-color: var(--wa-form-control-border-color);
    }
  }
`;
