import type { ReactElement } from "react";

type Variants = "primary" | "secondary"

export interface ButtonProps {
    variant: Variants;
    size: "sm" | "md" | "lg";
    text: string;
    startIcon?: ReactElement;
    endIcon?: ReactElement;
    onClick: () => void
}

const variantStyles = {

    "primary" : "bg-purple-600 text-white",
    "secondary": "bg-purple-300 text-purple-600"

}

const sizeStyles = {
    "sm": "<p-8></p-8> py-2",
    "md": "p-4 py-1",
    "lg": "p-6 py-2"
}

const defaultStyles = "rounded-md  p-4 flex"

export const Button = (props: ButtonProps) => {
    return (
        <button className={`${variantStyles[props.variant]} ${defaultStyles} ${sizeStyles[props.size]}`}>
          {props.startIcon ? 
          <div className="pr-2">
            {props.startIcon}
          </div> : null }
            {props.text}
            {props.endIcon}

        </button>
    )
}