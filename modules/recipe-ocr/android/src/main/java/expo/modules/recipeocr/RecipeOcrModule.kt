package expo.modules.recipeocr

import android.graphics.Rect
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/**
 * Reads the text in a photo with ML Kit, on the device. Returns the blocks of
 * text with their lines and positions, so the app can put two-column pages in
 * reading order.
 */
class RecipeOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecipeOcr")

    AsyncFunction("recognize") { uriString: String, promise: Promise ->
      try {
        val context = appContext.reactContext ?: throw Exception("The app isn't ready yet.")
        val uri = if (uriString.startsWith("content://") || uriString.startsWith("file://")) {
          Uri.parse(uriString)
        } else {
          Uri.fromFile(File(uriString))
        }
        // Reads the picture's rotation from its EXIF data, so phone photos come out upright.
        val image = InputImage.fromFilePath(context, uri)
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
        recognizer.process(image)
          .addOnSuccessListener { result ->
            val blocks = result.textBlocks.mapNotNull { block ->
              val box = block.boundingBox ?: return@mapNotNull null
              box(box) + mapOf(
                "lines" to block.lines.mapNotNull { line ->
                  line.boundingBox?.let { box(it) + mapOf("text" to line.text) }
                }
              )
            }
            recognizer.close()
            promise.resolve(blocks)
          }
          .addOnFailureListener { error ->
            recognizer.close()
            promise.reject(CodedException("ERR_RECOGNIZE", error.message ?: "Couldn't read the text.", error))
          }
      } catch (error: Exception) {
        promise.reject(CodedException("ERR_RECOGNIZE", error.message ?: "Couldn't open the picture.", error))
      }
    }
  }

  private fun box(r: Rect): Map<String, Any> = mapOf(
    "left" to r.left,
    "top" to r.top,
    "width" to r.width(),
    "height" to r.height()
  )
}
