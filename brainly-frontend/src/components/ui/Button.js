import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const variantStyles = {
    "primary": "bg-purple-600 text-white",
    "secondary": "bg-purple-300 text-purple-600"
};
const sizeStyles = {
    "sm": "<p-8></p-8> py-2",
    "md": "p-4 py-1",
    "lg": "p-6 py-2"
};
const defaultStyles = "rounded-md  p-4 flex";
export const Button = (props) => {
    return (_jsxs("button", { className: `${variantStyles[props.variant]} ${defaultStyles} ${sizeStyles[props.size]}`, children: [props.startIcon ?
                _jsx("div", { className: "pr-2", children: props.startIcon }) : null, props.text, props.endIcon] }));
};
//# sourceMappingURL=Button.js.map