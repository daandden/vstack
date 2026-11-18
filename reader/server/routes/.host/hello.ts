import { controlHandler, host } from "../../utils/flow-host";
export default controlHandler("/.host/hello", ["GET"], request => host.hello(request));
