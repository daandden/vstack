import { flowHandler, host } from "../../../../../../utils/flow-host";
export default flowHandler(request => host.flow(request, "assets"));
