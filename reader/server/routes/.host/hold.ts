import { controlHandler, host } from "../../utils/flow-host";
export default controlHandler("/.host/hold", ["GET"], request => host.hold(request));
