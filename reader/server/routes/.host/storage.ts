import { controlHandler, host } from "../../utils/flow-host";
export default controlHandler("/.host/storage", ["GET"], () => host.storage());
