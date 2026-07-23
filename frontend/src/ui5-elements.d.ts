import type React from 'react';

type UI5ElementProps = React.DetailedHTMLProps<
  React.HTMLAttributes<HTMLElement>,
  HTMLElement
> & {
  [attribute: string]: unknown;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'ui5-button': UI5ElementProps;
      'ui5-card': UI5ElementProps;
      'ui5-card-header': UI5ElementProps;
      'ui5-message-strip': UI5ElementProps;
      'ui5-shellbar': UI5ElementProps;
      'ui5-title': UI5ElementProps;
    }
  }
}

export {};
