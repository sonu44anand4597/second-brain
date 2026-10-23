import { jsx as _jsx } from "react/jsx-runtime";
import { iconSizeVarient, IconProps } from "./index";
const sizeVariants = {
    "sm": "size-2",
    "md": "size-4",
    "lg": "size-6"
};
export const PlusIcon = (props) => {
    return (_jsx("svg", { xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", "stroke-width": "1.5", stroke: "currentColor", className: iconSizeVarient[props.size], children: _jsx("path", { "stroke-linecap": "round", "stroke-linejoin": "round", d: "M12 4.5v15m7.5-7.5h-15" }) }));
};
//# sourceMappingURL=PlusIcons.js.map