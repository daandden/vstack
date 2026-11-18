import { controlHandler, host } from "../../utils/flow-host";
export default controlHandler("/.host/stop", ["POST"], () => host.stop());
