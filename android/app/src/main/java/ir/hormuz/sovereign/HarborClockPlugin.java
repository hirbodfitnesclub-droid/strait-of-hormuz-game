package ir.hormuz.sovereign;

import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HarborClock")
public class HarborClockPlugin extends Plugin {
    @PluginMethod
    public void sample(PluginCall call) {
        JSObject value = new JSObject();
        int boot = Build.VERSION.SDK_INT >= 24
                ? Settings.Global.getInt(getContext().getContentResolver(), Settings.Global.BOOT_COUNT, -1)
                : -1;
        value.put("boot", boot >= 0 ? "android/" + boot : "");
        value.put("ms", SystemClock.elapsedRealtime());
        call.resolve(value);
    }
}
