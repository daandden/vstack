import { flowHandler, host } from "../../utils/flow-host";
export default flowHandler(request => host.readerAsset(request));
