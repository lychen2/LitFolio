package dev.litera.desktop

import android.app.Activity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.chaquo.python.Python
import com.chaquo.python.android.AndroidPlatform
import java.util.concurrent.Executors

@TauriPlugin
class ReadingPlugin(activity: Activity) : Plugin(activity) {
    private val context = activity.applicationContext

    @Command
    fun startService(invoke: Invoke) {
        worker.execute {
            try {
                val args = invoke.getArgs()
                val home = args.getString("home")
                val library = args.getString("library")
                if (!Python.isStarted()) {
                    Python.start(AndroidPlatform(context))
                }
                val module = Python.getInstance().getModule("litfolio_android")
                val url = module.callAttr("start", home, library).toJava(String::class.java)
                invoke.resolve(JSObject().put("url", url))
            } catch (error: Exception) {
                invoke.reject("Could not start the reading service", error)
            } catch (error: LinkageError) {
                invoke.reject("Could not load the Android Python runtime: ${error.message}")
            }
        }
    }

    @Command
    fun stopService(invoke: Invoke) {
        worker.execute {
            try {
                if (Python.isStarted()) {
                    Python.getInstance().getModule("litfolio_android").callAttr("stop")
                }
                invoke.resolve()
            } catch (error: Exception) {
                invoke.reject("Could not stop the reading service", error)
            }
        }
    }

    private companion object {
        // A recreated Activity can receive commands while its predecessor is still stopping.
        val worker = Executors.newSingleThreadExecutor()
    }
}
