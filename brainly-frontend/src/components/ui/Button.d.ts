import type { ReactElement } from "react";
type Variants = "primary" | "secondary";
export interface ButtonProps {
    variant: Variants;
    size: "sm" | "md" | "lg";
    text: string;
    startIcon?: ReactElement;
    endIcon?: ReactElement;
    onClick: () => void;
}
export declare const Button: (props: ButtonProps) => import("react").JSX.Element;
export {};
//# sourceMappingURL=Button.d.ts.map