import { controlHandler, host } from "../../utils/flow-host";
export default controlHandler("/.host/picker", ["PUT", "DELETE"], request => host.picker(request));
