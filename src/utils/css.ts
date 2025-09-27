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

export const commonLinkStyle = css`
  a {
    color: var(--wa-color-text-link);
    text-decoration: var(--wa-link-decoration-default);
    -webkit-text-decoration: var(--wa-link-decoration-default); /* Safari */
    text-decoration-thickness: 0.09375em;
    text-underline-offset: 0.125em;

    @media (hover: hover) {
      &:hover {
        color: color-mix(in oklab, var(--wa-color-text-link), var(--wa-color-mix-hover));
        text-decoration: var(--wa-link-decoration-hover);
        -webkit-text-decoration: var(--wa-link-decoration-hover); /* Safari */
      }
    }
  }
`;
