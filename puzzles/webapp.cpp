#include <cassert>
#include <cstdarg>
#include <cstdint>
#include <optional>
#include <memory>
#include <span>
#include <string>
#include <utility>
#include <vector>

#include <emscripten.h>
#include <emscripten/bind.h>

// EM_ASM doesn't work properly, because we share generated JS between puzzles.
// (But EM_JS works just fine.)
#undef EM_ASM
#undef EM_ASM_INT
#undef EM_ASM_DOUBLE
#undef EM_ASM_PTR

extern "C" {
#include "puzzles.h"
}

using namespace emscripten;

EM_JS(void, throw_js_error, (const char* message), {
    throw new Error(UTF8ToString(message));
});

std::string slugify(const std::string& text) {
    std::string slug;
    slug.reserve(text.length());

    bool last_was_delimiter = false;
    for (const unsigned char c : text) {
        if (c > 127) {
            fatal("slugify: non-ASCII character: 0x%02X", c);
        }
        if (std::isalnum(c)) {
            if (last_was_delimiter && !slug.empty()) {
                slug += '-';
            }
            slug += static_cast<char>(std::tolower(c));
            last_was_delimiter = false;
        } else {
            last_was_delimiter = true;
        }
    }

    return slug;
}

// Converting std::vector to JS Array:
//
// We'd like to write `typedef std::vector<Foo> FooList`, and have FooList
// turn into TypeScript `Foo[]` (assuming Foo is also embindable). Unfortunately:
// - `register_vector<Foo>("FooList")` results in a custom JS Vector class,
//   which isn't iterable or indexable or usable like an ordinary JS Array.
// - Implicit bindings from vector to array via custom marshaling would be ideal
//   (https://github.com/emscripten-core/emscripten/issues/11070#issuecomment-717675128)
//   but that specific implementation causes compliation errors in current Emscripten.
//
// Instead, declare a custom emscripten::val type and convert manually:
//   EMSCRIPTEN_DECLARE_VAL_TYPE(FooList);
//   EMSCRIPTEN_BINDINGS(...) { register_type<FooList>("Foo[]"); }
//   Conversion (in C++):
//      FooList fooArray = val::array(foo_vector).as<FooList>();
//      std::vector<Foo> foo_vector = val::vecFromJSArray<Foo>(fooArray);

/*
 * Embind value objects
 * (Default constructors are required for embind)
 */

struct Colour {
    // (This deliberately matches the layout of the midend_colours return value.)
    float r, g, b;

    Colour() : r(0), g(0), b(0) {}
    Colour(float _r, float _g, float _b) : r(_r), g(_g), b(_b) {}
};

EMSCRIPTEN_DECLARE_VAL_TYPE(ColourList);

// JS-ified options for DrawingAPI.drawText
EMSCRIPTEN_DECLARE_VAL_TYPE(TextAlign); // "left" | "center" | "right"
EMSCRIPTEN_DECLARE_VAL_TYPE(TextBaseline); // "alphabetic" | "mathematical"
EMSCRIPTEN_DECLARE_VAL_TYPE(FontType); // "fixed" | "variable"

struct DrawTextOptions {
    TextAlign align;
    TextBaseline baseline;
    FontType fontType;
    int size;

    DrawTextOptions() : align(to_halign(ALIGN_HLEFT)),
                        baseline(to_valign(ALIGN_VNORMAL)),
                        fontType(to_fontType(FONT_VARIABLE)),
                        size(12) {}

    // From drawing_api draw_text params:
    DrawTextOptions(
        int _fonttype, int _fontsize, int _align
    ) : align(to_halign(_align)),
        baseline(to_valign(_align)),
        fontType(to_fontType(_fonttype)),
        size(_fontsize) {}

private:
    static TextAlign to_halign(int align) {
        static constexpr int ALIGN_HMASK = ALIGN_HLEFT | ALIGN_HCENTRE | ALIGN_HRIGHT;
        if ((align & ALIGN_HMASK) == ALIGN_HLEFT)
            return val("left").as<TextAlign>();
        if ((align & ALIGN_HMASK) == ALIGN_HCENTRE)
            return val("center").as<TextAlign>();
        return val("right").as<TextAlign>();
    }

    static TextBaseline to_valign(int align) {
        static constexpr int ALIGN_VMASK = ALIGN_VCENTRE | ALIGN_VNORMAL;
        if ((align & ALIGN_VMASK) == ALIGN_VCENTRE)
            return val("mathematical").as<TextBaseline>();
        return val("alphabetic").as<TextBaseline>();
    }

    static FontType to_fontType(int fonttype) {
        if (fonttype == FONT_FIXED)
            return val("fixed").as<FontType>();
        return val("variable").as<FontType>();
    }
};

struct KeyLabel {
    std::string label;
    int button = 0;

    KeyLabel() = default;

    explicit KeyLabel(const key_label &_key) :
        label(std::string(_key.label)),
        button(_key.button) {}
};

EMSCRIPTEN_DECLARE_VAL_TYPE(KeyLabelList);

// Although most drawing API functions use int coords,
// draw_thick_line uses float. Since both map to JS number,
// use floats here to avoid having two different `Point` objects in JS.
struct Point {
    float x, y;
    Point() : x(0), y(0) {}
    Point(const float _x, const float _y) : x(_x), y(_y) {}

    Point(const int _x, const int _y)
        : x(static_cast<float>(_x)), y(static_cast<float>(_y)) {}

    // IntPoint is useful for draw_polygon argument coercion.
    typedef struct {
        int x, y;
    } IntPoint;

    explicit Point(const IntPoint &_p) : Point(_p.x, _p.y) {}
};

EMSCRIPTEN_DECLARE_VAL_TYPE(PointList);

struct Rect {
    int x, y, w, h;
    Rect() : x(0), y(0), w(0), h(0) {}
    Rect(int _x, int _y, int _w, int _h) : x(_x), y(_y), w(_w), h(_h) {}
};

typedef std::optional<Rect> OptionalRect;

struct Size {
    int w, h;
    Size() : w(0), h(0) {}
    Size(int _w, int _h) : w(_w), h(_h) {}
};

EMSCRIPTEN_DECLARE_VAL_TYPE(StringList);

EMSCRIPTEN_BINDINGS(utilities) {
    value_object<Colour>("Colour")
        .field("r", &Colour::r)
        .field("g", &Colour::g)
        .field("b", &Colour::b);
    register_type<ColourList>("Colour[]");

    // Would like to use lib.dom.d.ts CanvasTextAlign and CanvasTextBaseline,
    // but tsgen throws `BindingError: emval::as has unknown type 15CanvasTextAlign`.
    register_type<TextAlign>(R"("left" | "center" | "right")");
    register_type<TextBaseline>(R"("alphabetic" | "mathematical")");
    register_type<FontType>(R"("fixed" | "variable")");
    value_object<DrawTextOptions>("DrawTextOptions")
        .field("align", &DrawTextOptions::align)
        .field("baseline", &DrawTextOptions::baseline)
        .field("fontType", &DrawTextOptions::fontType)
        .field("size", &DrawTextOptions::size);

    value_object<KeyLabel>("KeyLabel")
        .field("label", &KeyLabel::label)
        .field("button", &KeyLabel::button);
    register_type<KeyLabelList>("KeyLabel[]");

    value_object<Point>("Point").field("x", &Point::x).field("y", &Point::y);
    register_type<PointList>("Point[]");

    value_object<Rect>("Rect")
        .field("x", &Rect::x)
        .field("y", &Rect::y)
        .field("w", &Rect::w)
        .field("h", &Rect::h);
    register_optional<Rect>();

    value_object<Size>("Size").field("w", &Size::w).field("h", &Size::h);

    register_optional<int>();

    register_optional<std::string>();
    register_type<StringList>("string[]");
}

/*
 * Drawing class -- implemented in JS
 */

// This allows implementing the drawing_api in JS code, (mostly) with type
// checking on both sides, and using embind's generated ClassHandle glue
// for interoperatbility between C and JS object instances.
//
// Embind's mechanism for a JS implementation requires listing each function
// three times:
// 1. In `class Drawing`, an abstract base class that declares a pure virtual
//    method for each function. This is neccessary for embind to allow JS
//    overrides of the functions. (We use camelCase to match JS norms.)
// 2. In `class DrawingWrapper`, a concrete implementation of `class Drawing`
//    that calls out to JS methods. This layer also maps C types to and from
//    embind `val` (native JS) types to simplify the JS code.
// 3. In EMSCRIPTEN_BINDINGS, to declare the DrawingWrapper methods
//    available for implementation/use in JS.
//
// Compiling generates a .d.ts file that exports TypeScript interfaces for
// `DrawingWrapper` (the functions that must be implemented in JS), `Drawing`
// (the object type that must be passed to `Frontend.setDrawing`), and a module property
// `Drawing` that is used to bind an instance of the JS DrawingWrapper's
// implementation to C code, by calling `module.Drawing.implement(instance)`.

EMSCRIPTEN_DECLARE_VAL_TYPE(Blitter);

constexpr float default_line_thickness = 1.0f;

class Drawing {
public:
    virtual ~Drawing() = default;

    virtual void drawText(
        const Point &origin, const DrawTextOptions &options, int colour,
        const std::string &text
    ) = 0;

    virtual void drawRect(const Rect &rect, int colour) = 0;

    virtual void drawLine(
        const Point &start, const Point &end, int colour, float thickness
    ) = 0;

    void drawLine(const Point &start, const Point &end, int colour) {
        return drawLine(start, end, colour, default_line_thickness);
    }

    virtual void drawPolygon(
        const PointList &coords, int fillcolour, int outlinecolour
    ) = 0;

    virtual void drawCircle(
        const Point &origin, int radius, int fillcolour, int outlinecolour
    ) = 0;

    virtual void drawUpdate(const Rect &rect) = 0;
    virtual void clip(const Rect &rect) = 0;
    virtual void unclip() = 0;
    virtual void startDraw() = 0;
    virtual void endDraw() = 0;
    virtual Blitter blitterNew(const Size &size) = 0;
    virtual void blitterFree(const Blitter &bl) = 0;
    virtual void blitterSave(const Blitter &bl, const Point &origin) = 0;
    virtual void blitterLoad(const Blitter &bl, const Point &origin) = 0;
};

class DrawingWrapper : public wrapper<Drawing> {
public:
    EMSCRIPTEN_WRAPPER(explicit DrawingWrapper);

    void drawText(
        const Point &origin, const DrawTextOptions &options, int colour,
        const std::string &text
    ) override {
        return call<void>("drawText", origin, options, colour, text);
    }

    void drawRect(const Rect &rect, int colour) override {
        return call<void>("drawRect", rect, colour);
    }

    void drawLine(
        const Point &start, const Point &end, int colour, float thickness
    ) override {
        // This combines drawing_api's draw_line and draw_thick_line.
        return call<void>("drawLine", start, end, colour, thickness);
    }

    void drawPolygon(
        const PointList &coords, int fillcolour, int outlinecolour
    ) override {
        return call<void>("drawPolygon", coords, fillcolour, outlinecolour);
    }

    void drawCircle(
        const Point &origin, int radius, int fillcolour, int outlinecolour
    ) override {
        return call<void>("drawCircle", origin, radius, fillcolour, outlinecolour);
    }

    void drawUpdate(const Rect &rect) override {
        return call<void>("drawUpdate", rect);
    }

    void clip(const Rect &rect) override { return call<void>("clip", rect); }

    void unclip() override { return call<void>("unclip"); }

    void startDraw() override { return call<void>("startDraw"); }

    void endDraw() override { return call<void>("endDraw"); }

    Blitter blitterNew(const Size &size) override {
        return call<Blitter>("blitterNew", size).as<Blitter>();
    }

    void blitterFree(const Blitter &bl) override {
        return call<void>("blitterFree", bl);
    }

    void blitterSave(const Blitter &bl, const Point &origin) override {
        return call<void>("blitterSave", bl, origin);
    }

    void blitterLoad(const Blitter &bl, const Point &origin) override {
        return call<void>("blitterLoad", bl, origin);
    }

    // (Printing API not implemented)
};

EMSCRIPTEN_BINDINGS(drawing) {
    register_type<Blitter>("unknown");

    // ReSharper disable once CppExpressionWithoutSideEffects
    class_<Drawing>("Drawing")
        .smart_ptr<std::shared_ptr<Drawing> >("Drawing")
        .function("drawText(origin, options, colour, text)", &DrawingWrapper::drawText)
        .function("drawRect(rect, colour)", &DrawingWrapper::drawRect)
        .function("drawLine(p1, p2, colour, thickness)", &DrawingWrapper::drawLine)
        .function(
            "drawPolygon(coords, fillcolour, outlinecolour)",
            &DrawingWrapper::drawPolygon
        )
        .function(
            "drawCircle(centre, radius, fillcolour, outlinecolour)",
            &DrawingWrapper::drawCircle
        )
        .function("drawUpdate(rect)", &DrawingWrapper::drawUpdate)
        .function("clip(rect)", &DrawingWrapper::clip)
        .function("unclip", &DrawingWrapper::unclip)
        .function("startDraw", &DrawingWrapper::startDraw)
        .function("endDraw", &DrawingWrapper::endDraw)
        .function("blitterNew(size)", &DrawingWrapper::blitterNew)
        .function("blitterFree(blitter)", &DrawingWrapper::blitterFree)
        .function("blitterSave(blitter, origin)", &DrawingWrapper::blitterSave)
        .function("blitterLoad(blitter, origin)", &DrawingWrapper::blitterLoad)
        .allow_subclass<DrawingWrapper>("DrawingWrapper");
}

/*
 * Drawing API
 */

Drawing *DRAWING(const drawing *dr);

struct blitter {
    // an emscripten::val -- any JS object or value
    const Blitter js_value;

    explicit blitter(Blitter _value) : js_value(std::move(_value)) {}
};

void js_draw_text(
    drawing *dr, int x, int y, int fonttype, int fontsize, int align,
    int colour, const char *text
) {
    const auto options = DrawTextOptions(fonttype, fontsize, align);
    DRAWING(dr)->drawText(Point(x, y), options, colour, std::string(text));
}

void js_draw_rect(drawing *dr, int x, int y, int w, int h, int colour) {
    DRAWING(dr)->drawRect(Rect(x, y, w, h), colour);
}

void js_draw_line(drawing *dr, int x1, int y1, int x2, int y2, int colour) {
    DRAWING(dr)->drawLine(Point(x1, y1), Point(x2, y2), colour);
}

void js_draw_polygon(
    drawing *dr, const int *coords, int npoints, int fillcolour,
    int outlinecolour
) {
    static_assert(
        sizeof(Point::IntPoint) == 2 * sizeof(*coords),
        "_IntPoint doesn't match draw_polygon coords layout"
    );
    auto points = reinterpret_cast<const Point::IntPoint *>(coords);
    auto points_vec = std::vector<Point>();
    points_vec.reserve(npoints);
    for (const auto point_ptr: std::span(points, npoints))
        points_vec.emplace_back(point_ptr);
    auto point_list = val::array(points_vec).as<PointList>();
    DRAWING(dr)->drawPolygon(point_list, fillcolour, outlinecolour);
}

void js_draw_circle(
    drawing *dr, int cx, int cy, int radius, int fillcolour,
    int outlinecolour
) {
    DRAWING(dr)->drawCircle(Point(cx, cy), radius, fillcolour, outlinecolour);
}

void js_draw_update(drawing *dr, int x, int y, int w, int h) {
    DRAWING(dr)->drawUpdate(Rect(x, y, w, h));
}

void js_clip(drawing *dr, int x, int y, int w, int h) {
    DRAWING(dr)->clip(Rect(x, y, w, h));
}

void js_unclip(drawing *dr) { DRAWING(dr)->unclip(); }

void js_start_draw(drawing *dr) { DRAWING(dr)->startDraw(); }

void js_end_draw(drawing *dr) { DRAWING(dr)->endDraw(); }

blitter *js_blitter_new(drawing *dr, int w, int h) {
    Blitter js_value = DRAWING(dr)->blitterNew(Size(w, h));
    return new blitter(js_value);
}

void js_blitter_free(drawing *dr, blitter *bl) {
    DRAWING(dr)->blitterFree(bl->js_value);
    delete bl;
}

void js_blitter_save(drawing *dr, blitter *bl, int x, int y) {
    DRAWING(dr)->blitterSave(bl->js_value, Point(x, y));
}

void js_blitter_load(drawing *dr, blitter *bl, int x, int y) {
    DRAWING(dr)->blitterLoad(bl->js_value, Point(x, y));
}

void js_draw_thick_line(
    drawing *dr, float thickness, float x1, float y1, float x2,
    float y2, int colour
) {
    DRAWING(dr)->drawLine(Point(x1, y1), Point(x2, y2), colour, thickness);
}


/*
 * Notifications -- from the Frontend to JS
 */

// All of this should result in emitting TypeScript declarations equivalent to:
//    type Notification = NotifyGameIdChange | NotifyGameStateChange | ...;
//    type NotifyCallbackFunc = (message: Notification) => void;
// with `ChangeNotification` being a discriminated union of all the Notify types.

#define VAL_CONSTANT(type, name, value) \
    inline type name() { \
        static const auto constant = val::u8string(value).as<type>(); \
        return constant; \
    }

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyGameIdChangeType);
VAL_CONSTANT(NotifyGameIdChangeType, GAME_ID_CHANGE, "game-id-change")
struct NotifyGameIdChange {
    NotifyGameIdChangeType type = GAME_ID_CHANGE();
    std::string currentGameId;
    std::optional<std::string> randomSeed = std::nullopt;

    NotifyGameIdChange() = default;

    explicit NotifyGameIdChange(midend *me) {
        auto const game_id = midend_get_game_id(me);
        currentGameId = std::string(game_id);
        sfree(game_id);

        auto const random_seed = midend_get_random_seed(me);
        randomSeed = random_seed == nullptr
                          ? std::nullopt
                          : std::optional(std::string(random_seed));
        sfree(random_seed);
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(GameStatus);
VAL_CONSTANT(GameStatus, STATUS_ONGOING, "ongoing")
VAL_CONSTANT(GameStatus, STATUS_SOLVED, "solved")
// VAL_CONSTANT(GameStatus, STATUS_SOLVED_WITH_HELP, "solved-with-help")
VAL_CONSTANT(GameStatus, STATUS_LOST, "lost")

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyGameStateChangeType);
VAL_CONSTANT(NotifyGameStateChangeType, GAME_STATE_CHANGE, "game-state-change")
struct NotifyGameStateChange {
    NotifyGameStateChangeType type = GAME_STATE_CHANGE();
    GameStatus status = STATUS_ONGOING();
    int currentMove = 0;
    int totalMoves = 0;
    bool canUndo = false;
    bool canRedo = false;

    NotifyGameStateChange() = default;

    explicit NotifyGameStateChange(midend *me)
        : canUndo(midend_can_undo(me)),
          canRedo(midend_can_redo(me)) {
        midend_get_move_count(me, &currentMove, &totalMoves);
        auto const _status = midend_status(me);
        if (_status < 0) {
            status = STATUS_LOST();
        } else if (_status > 0) {
            // TODO: separate midend status for STATUS_SOLVED_WITH_HELP()
            status = STATUS_SOLVED();
        } else {
            status = STATUS_ONGOING();
        }
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyParamsChangeType);
VAL_CONSTANT(NotifyParamsChangeType, PARAMS_CHANGE, "params-change")
struct NotifyParamsChange {
    NotifyParamsChangeType type = PARAMS_CHANGE();
    std::string params;

    NotifyParamsChange() = default;

    explicit NotifyParamsChange(midend *me) {
        auto const _params= midend_get_encoded_params(me);
        params = std::string(_params);
        sfree(_params);
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyStatusBarChangeType);
VAL_CONSTANT(NotifyStatusBarChangeType, STATUS_BAR_CHANGE, "status-bar-change")
struct NotifyStatusBarChange {
    NotifyStatusBarChangeType type = STATUS_BAR_CHANGE();
    std::string statusBarText;

    NotifyStatusBarChange() = default;

    explicit NotifyStatusBarChange(std::string text): statusBarText(std::move(text)) {}
};

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyCallbackFunc);

EMSCRIPTEN_BINDINGS(notifiations) {
    register_type<NotifyGameIdChangeType>("\"game-id-change\"");
    value_object<NotifyGameIdChange>("NotifyGameIdChange")
        .field("type", &NotifyGameIdChange::type)
        .field("currentGameId", &NotifyGameIdChange::currentGameId)
        .field("randomSeed", &NotifyGameIdChange::randomSeed);

    register_type<GameStatus>(R"("ongoing" | "solved" | "solved-with-help" | "lost")");
    register_type<NotifyGameStateChangeType>("\"game-state-change\"");
    value_object<NotifyGameStateChange>("NotifyGameStateChange")
        .field("type", &NotifyGameStateChange::type)
        .field("status", &NotifyGameStateChange::status)
        .field("currentMove", &NotifyGameStateChange::currentMove)
        .field("totalMoves", &NotifyGameStateChange::totalMoves)
        .field("canUndo", &NotifyGameStateChange::canUndo)
        .field("canRedo", &NotifyGameStateChange::canRedo);

    register_type<NotifyParamsChangeType>("\"params-change\"");
    value_object<NotifyParamsChange>("NotifyParamsChange")
        .field("type", &NotifyParamsChange::type)
        .field("params", &NotifyParamsChange::params);

    register_type<NotifyStatusBarChangeType>("\"status-bar-change\"");
    value_object<NotifyStatusBarChange>("NotifyStatusBarChange")
        .field("type", &NotifyStatusBarChange::type)
        .field("statusBarText", &NotifyStatusBarChange::statusBarText);

    // (Must inline the Notification union to get Emscripten to emit it.)
    register_type<NotifyCallbackFunc>(R"(
        (message:
            | NotifyGameIdChange
            | NotifyGameStateChange
            | NotifyParamsChange
            | NotifyStatusBarChange
        ) => void
    )");
};



/*
 * Serialization and deserialization buffers
 */

EMSCRIPTEN_DECLARE_VAL_TYPE(Uint8Array);

class WriteBuffer {
    val buffer;
    size_t position = 0;

public:
    explicit WriteBuffer(size_t initial_size = 4096) {
        buffer = val::global("Uint8Array").new_(initial_size);
    }

    void append(const void *data, size_t len) {
        const size_t new_position = position + len;
        const auto current_size = buffer["length"].as<size_t>();

        // Grow if needed
        if (new_position > current_size) {
            size_t new_size = (std::max)(current_size * 2, new_position);
            const auto new_buffer = val::global("Uint8Array").new_(new_size);
            new_buffer.call<void>("set", buffer);
            buffer = new_buffer;
        }

        // Copy data directly
        const auto view = val::global("Uint8Array").new_(
            buffer["buffer"], position, len
        );
        view.call<void>(
            "set", typed_memory_view(len, static_cast<const uint8_t *>(data))
        );
        position = new_position;
    }

    Uint8Array finalize() {
        // Return exactly-sized buffer
        return val::global("Uint8Array").new_(buffer["buffer"], 0, position).as<
            Uint8Array>();
    }

    static void write_callback(void *ctx, const void *buf, int len) {
        static_cast<WriteBuffer *>(ctx)->append(buf, len);
    }
};

// JS-side helper for copying from (non-heap) ArrayBuffer into heap buffer
EM_JS(void, copy_from_js_buffer, (
    EM_VAL js_buffer,
    size_t js_position,
    size_t length,
    uint8_t* dest_ptr
), {
    const sourceBuffer = Emval.toValue(js_buffer);
    const sourceView = new Uint8Array(
        sourceBuffer.buffer,
        sourceBuffer.byteOffset + js_position,
        length
    );
    const destView = new Uint8Array(HEAPU8.buffer, dest_ptr, length);
    destView.set(sourceView);
});

class ReadBuffer {
    Uint8Array buffer;
    size_t position = 0;
    size_t total_size;

public:
    explicit ReadBuffer(const Uint8Array &uint8_array)
        : buffer(uint8_array), total_size(uint8_array["length"].as<size_t>()) {}

    bool read(void *buf, size_t len) {
        if (position + len > total_size) {
            return false; // Not enough data
        }
        copy_from_js_buffer(
            buffer.as_handle(),
            position,
            len,
            static_cast<uint8_t *>(buf)
        );
        position += len;
        return true;
    }

    static bool read_callback(void *ctx, void *buf, int len) {
        return static_cast<ReadBuffer *>(ctx)->read(buf, len);
    }
};

/*
 * frontend -- exported to JS as Frontend.
 * Wraps midend functions for use by JS.
 * Provides frontend functions required by midend.
 */

EMSCRIPTEN_DECLARE_VAL_TYPE(PresetMenuEntryList);
typedef std::optional<PresetMenuEntryList> OptionalPresetMenuEntryList;
struct PresetMenuEntry {
    // TODO: these fields really should be const, but embind value_object doesn't like that
    std::string title;
    std::string params;
    OptionalPresetMenuEntryList submenu = std::nullopt;

    PresetMenuEntry() = default;

    explicit PresetMenuEntry(midend *me, const preset_menu_entry &preset) :
        title(preset.title),
        params(midend_get_encoded_params_for_preset(me, preset.id)),
        submenu(
            preset.submenu == nullptr
                ? std::nullopt
                : OptionalPresetMenuEntryList(build_menu(me, preset.submenu))
        ) {}

    static PresetMenuEntryList build_menu(midend *me, const preset_menu *menu) {
        auto entries = std::span(menu->entries, menu->n_entries);
        auto menu_vec = std::vector<PresetMenuEntry>();
        for (auto &entry: entries) {
            menu_vec.emplace_back(me, entry);
        }
        return val::array(menu_vec).as<PresetMenuEntryList>();
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(ConfigDescription);
EMSCRIPTEN_DECLARE_VAL_TYPE(ConfigValues);
EMSCRIPTEN_DECLARE_VAL_TYPE(ConfigValuesIn);

EMSCRIPTEN_DECLARE_VAL_TYPE(ActivateTimerFunc);
EMSCRIPTEN_DECLARE_VAL_TYPE(DeactivateTimerFunc);
EMSCRIPTEN_DECLARE_VAL_TYPE(TextFallbackFunc);
struct FrontendConstructorArgs {
    ActivateTimerFunc activateTimer = val::undefined().as<ActivateTimerFunc>();
    DeactivateTimerFunc deactivateTimer = val::undefined().as<DeactivateTimerFunc>();
    TextFallbackFunc textFallback = val::undefined().as<TextFallbackFunc>();
    NotifyCallbackFunc notifyChange = val::undefined().as<NotifyCallbackFunc>();

    FrontendConstructorArgs() = default;
};

const drawing_api *get_js_drawing_api();

struct frontend {
private:
    std::unique_ptr<midend, decltype(&midend_free)> me_ptr;
    [[nodiscard]] midend* me() const { return me_ptr.get(); }
    std::string statusbarText;

    // Used by getColourPalette / frontend_default_colour
    bool defaultBackgroundIsValid = false;
    Colour defaultBackground;

    // Callbacks into JS
    ActivateTimerFunc activateTimer;
    DeactivateTimerFunc deactivateTimer;
    TextFallbackFunc textFallback;
    NotifyCallbackFunc notifyChange;

public:
    // Allow late binding of JS Drawing, by passing myself as the drhandle.
    // (Unwound in DRAWING() accessor below.)
    Drawing *drawing = nullptr;

    explicit frontend(const FrontendConstructorArgs &args)
        : me_ptr(
              // For midend purposes, the frontend is also the drhandle.
              midend_new(this, &thegame, get_js_drawing_api(), this),
              midend_free
          ),
          activateTimer(args.activateTimer),
          deactivateTimer(args.deactivateTimer),
          textFallback(args.textFallback),
          notifyChange(args.notifyChange) {

        midend_request_id_changes(me(), notify_id_changes, this);

        // Notify the default params.
        notifyParamsChange();
    }

    void setDrawing(Drawing *_drawing) { drawing = _drawing; }

private:
    // midend_request_id_changes callback
    static void notify_id_changes(void *ctx) {
        static_cast<frontend *>(ctx)->notifyGameIdChange();
    }

    void notifyGameIdChange() const {
        auto message = NotifyGameIdChange(me());
        notifyChange(message);
    }

    void notifyGameStateChange() const {
        auto message = NotifyGameStateChange(me());
        notifyChange(message);
    }

    void notifyParamsChange() const {
        auto message = NotifyParamsChange(me());
        notifyChange(message);
    }

public:
    // We don't expose the entire game struct:
    //   const game *midend_which_game(midend *me);
    // but instead provide useful game fields that don't have midend accessors.
    // https://www.chiark.greenend.org.uk/~sgtatham/puzzles/devel/midend.html#frontend-backend
    [[nodiscard]] std::string getName() const { return midend_which_game(me())->name; }

    [[nodiscard]] bool getCanConfigure() const {
        return midend_which_game(me())->can_configure;
    }

    [[nodiscard]] bool getCanSolve() const {
        return midend_which_game(me())->can_solve;
    }

    [[nodiscard]] bool getNeedsRightButton() const {
        return midend_which_game(me())->flags & REQUIRE_RBUTTON;
    }

    [[nodiscard]] Size size(
        const Size &maxSize, bool isUserSize, double devicePixelRatio
    ) const {
        int x = maxSize.w;
        int y = maxSize.h;
        midend_size(me(), &x, &y, isUserSize, devicePixelRatio);
        return {x, y};
    }

    void resetTileSize() const { midend_reset_tilesize(me()); }

    void newGame() const {
        midend_new_game(me()); // will callback to notify_id_changes
        notifyGameStateChange();
    }

    void restartGame() const {
        midend_restart_game(me());
        notifyGameStateChange();
    }

    /**
     * Returns true if the puzzle wanted the button (regardless of whether
     * the button had any effect in the current context), false if the puzzle
     * doesn't use this button.
     */
    [[nodiscard]] bool processKey(const int x, const int y, const int button) const {
        const auto result = midend_process_key(me(), x, y, button);
        if (result == PKR_SOME_EFFECT) {
            // Skip state change notification on dragging -- it overwhelms the UI.
            // TODO: maybe throttle instead of skipping altogether?
            if (!IS_MOUSE_DRAG(button)) {
                notifyGameStateChange();
            }
        }
        // PKR_QUIT means the midend recognized the 'Q' key or similar; it has
        // no other effect in the midend/backend. (So treat it as PKR_UNUSED.)
        return result == PKR_SOME_EFFECT || result == PKR_NO_EFFECT;
    }

    [[nodiscard]] KeyLabelList requestKeys() const {
        int nkeys;
        auto key_labels = midend_request_keys(me(), &nkeys);
        auto keys_vec = std::vector<KeyLabel>();
        keys_vec.reserve(nkeys);
        for (const auto key_label_ref: std::span(key_labels, nkeys))
            keys_vec.emplace_back(key_label_ref);
        free_keys(key_labels, nkeys);
        return val::array(keys_vec).as<KeyLabelList>();
    }

    [[nodiscard]] std::string currentKeyLabel(int button) const {
        // midend handles memory management
        return midend_current_key_label(me(), button);
    }

    [[nodiscard]] std::string getStatusbarText() const { return statusbarText; }

    void forceRedraw() const {
        if (drawing != nullptr)
            midend_force_redraw(me());
    }

    void redraw() const {
        if (drawing != nullptr)
            midend_redraw(me());
    }

    [[nodiscard]] ColourList getColourPalette(const Colour& _defaultBackground) {
        defaultBackground = _defaultBackground;
        defaultBackgroundIsValid = true;

        // midend_colours returns an allocated array of ncolours r,g,b values
        // (that is, 3 * ncolours floats long).
        int ncolours;
        auto *colours = midend_colours(me(), &ncolours);
        static_assert(
            sizeof(Colour) == 3 * sizeof(*colours),
            "Colour doesn't match midend_colours layout"
        );
        auto colours_vec = std::vector<Colour>(ncolours);
        colours_vec.assign_range(
            std::span(reinterpret_cast<Colour *>(colours), ncolours)
        );
        sfree(colours);

        defaultBackgroundIsValid = false;
        return val::array(colours_vec).as<ColourList>();
    }

    void freezeTimer(float tprop) const { midend_freeze_timer(me(), tprop); }

    void timer(float tplus) const { midend_timer(me(), tplus); }

    [[nodiscard]] bool getWantsStatusbar() const {
        return midend_wants_statusbar(me());
    }

private:
    static std::string config_item_id(const config_item *item, const bool slug_ids) {
        return slug_ids ? slugify(item->name) : item->kw;
    }

    [[nodiscard]] ConfigDescription build_config_description(const int which) const {
        char *title;
        auto *config_items = midend_get_config(me(), which, &title);

        auto config = val::object();
        config.set("title", std::string(title));

        // CFG_PREFS have keywords defined. CFG_SETTINGS and other CFG types
        // leave kw uninitialized; use the slugified name for them.
        auto const slug_ids = which != CFG_PREFS;

        auto items = val::object();
        // Process config items until we hit C_END
        for (const config_item *config_item = config_items;
             config_item->type != C_END;
             config_item++) {
            auto item = val::object();
            item.set("name", std::string(config_item->name));

            switch (config_item->type) {
                case C_STRING:
                    item.set("type", "string");
                    break;

                case C_BOOLEAN:
                    item.set("type", "boolean");
                    break;

                case C_CHOICES: {
                    // Split options string using first char as delimiter
                    std::vector<std::string> options;
                    const char *str = config_item->u.choices.choicenames + 1; // Skip delimiter char
                    char delimiter = config_item->u.choices.choicenames[0];

                    while (*str != '\0') {
                        const char *end = strchr(str, delimiter);
                        if (!end) {
                            options.emplace_back(str);
                            break;
                        }
                        options.emplace_back(str, end - str);
                        str = end + 1;
                    }

                    item.set("type", "choices");
                    item.set("choicenames", val::array(options));
                    break;
                }

                default:
                    item.set("type", "unknown");
                    item.set("raw_type", config_item->type);
                    break;
            }

            auto id = config_item_id(config_item, slug_ids);
            items.set(id, item);
        }

        free_cfg(config_items);
        sfree(title);

        config.set("items", items);
        return config.as<ConfigDescription>();
    }

    // Converts config_items to ConfigValues
    [[nodiscard]] static ConfigValues config_values_from_config(
        const config_item *config_items, const bool slug_ids
    ) {
        auto values = val::object();
        for (const config_item *config_item = config_items; config_item->type != C_END;
             config_item++) {
            auto id = config_item_id(config_item, slug_ids);
            switch (config_item->type) {
                case C_STRING:
                    values.set(id, std::string(config_item->u.string.sval));
                    break;
                case C_BOOLEAN:
                    values.set(id, config_item->u.boolean.bval != 0);
                    break;
                case C_CHOICES:
                    values.set(id, config_item->u.choices.selected);
                    break;
                default:
                    break;
            }
        }
        return values.as<ConfigValues>();
    }

    // Applies non-null/undefined ConfigValues to matching config_items.
    // Returns true if any changes applied.
    static bool config_values_to_config(
        config_item *config_items, const ConfigValuesIn &values, const bool slug_ids
    ) {
        bool changed = false;
        for (config_item *config_item = config_items;
             config_item->type != C_END;
             config_item++) {
            auto id = config_item_id(config_item, slug_ids);
            auto value = values[id];
            if (value.isUndefined() || value.isNull()) {
                // Keep current value for this config_item
                continue;
            }

            switch (config_item->type) {
                case C_STRING: {
                    const auto str_val = value.as<std::string>();
                    if (str_val != config_item->u.string.sval) {
                        sfree(config_item->u.string.sval); // free original value
                        config_item->u.string.sval = dupstr(str_val.c_str());
                        changed = true;
                    }
                    break;
                }
                case C_BOOLEAN: {
                    const auto bool_val = value.as<bool>();
                    if (bool_val != config_item->u.boolean.bval) {
                        config_item->u.boolean.bval = bool_val;
                        changed = true;
                    }
                    break;
                }
                case C_CHOICES: {
                    const auto int_val = value.as<int>();
                    if (int_val != config_item->u.choices.selected) {
                        config_item->u.choices.selected = int_val;
                        changed = true;
                    }
                    break;
                }
                default:
                    break;
            }
        }
        return changed;
    }

    [[nodiscard]] ConfigValues get_config_values(const int which) const {
        char *title;
        auto *config_items = midend_get_config(me(), which, &title);
        const auto values = config_values_from_config(config_items, which != CFG_PREFS);
        free_cfg(config_items);
        sfree(title);
        return values;
    }

    [[nodiscard]] std::optional<std::string> set_config_values(
        const int which, const ConfigValuesIn &values
    ) const {
        char *title;
        auto *config_items = midend_get_config(me(), which, &title);
        std::optional<std::string> result = std::nullopt;
        if (config_values_to_config(config_items, values, which != CFG_PREFS)) {
            if (const auto error = midend_set_config(me(), which, config_items))
                result = error;
        }
        free_cfg(config_items);
        sfree(title);
        return result;
    }

public:
    [[nodiscard]] ConfigDescription getPreferencesConfig() const {
        return build_config_description(CFG_PREFS);
    }

    [[nodiscard]] ConfigValues getPreferences() const {
        return get_config_values(CFG_PREFS);
    }

    [[nodiscard]] std::optional<std::string> setPreferences(
        const ConfigValuesIn &values
    ) const {
        return set_config_values(CFG_PREFS, values);
    }

    [[nodiscard]] Uint8Array savePreferences() const {
        WriteBuffer buffer;
        midend_save_prefs(me(), WriteBuffer::write_callback, &buffer);
        return buffer.finalize();
    }

    [[nodiscard]] std::optional<std::string> loadPreferences(const Uint8Array &data) const {
        ReadBuffer buffer(data);
        const auto error = midend_load_prefs(me(), ReadBuffer::read_callback, &buffer);
        if (error) {
            // midend_load_prefs returns a static string on error
            return std::string(error);
        }
        return std::nullopt;
    }

/*
 * Params
 */

    [[nodiscard]] std::string getParams() const {
        const auto encoded= midend_get_encoded_params(me());
        const auto result = std::string(encoded);
        sfree(encoded);
        return result;
    }

    // (This is not a property setter. It can return an error message.)
    [[nodiscard]] std::optional<std::string> setParams(
        const std::string &encodedParams
    ) const {
        if (const auto error = midend_set_encoded_params(me(), encodedParams.c_str())) {
            return std::string(error);
        }
        notifyParamsChange();
        return std::nullopt;
    }

    [[nodiscard]] PresetMenuEntryList getPresets() const {
        const auto *presets = midend_get_presets(me(), nullptr);
        return PresetMenuEntry::build_menu(me(), presets);
    }

    [[nodiscard]] ConfigDescription getCustomParamsConfig() const {
        return build_config_description(CFG_SETTINGS);
    }

    [[nodiscard]] ConfigValues getCustomParams() const {
        return get_config_values(CFG_SETTINGS);
    }

    [[nodiscard]] std::optional<std::string> setCustomParams(
        const ConfigValuesIn &values
    ) const {
        const auto error = set_config_values(CFG_SETTINGS, values);
        if (error == std::nullopt)
            notifyParamsChange();
        return error;
    }

    // Return encoded params representing values or "#ERROR:..." if result
    // is invalid. Makes no changes to the midend or current game state.
    [[nodiscard]] std::string encodeCustomParams(
        const ConfigValuesIn &values
    ) const {
        const auto ourgame = midend_which_game(me());

        // Get default config items and apply ConfigValues
        auto *default_params = ourgame->default_params();
        const auto config_items = ourgame->configure(default_params);
        midend_free_params(me(), default_params);

        config_values_to_config(config_items, values, true);

        // Convert config items to params and encode
        auto *params = ourgame->custom_params(config_items);
        free_cfg(config_items);

        std::string result;
        if (const auto error = ourgame->validate_params(params, true)) {
            result.reserve(8 + strlen(error));
            result.append("#ERROR:");
            result.append(error);
        } else {
            const auto encoded = midend_encode_params(me(), params);
            result = std::string(encoded);
            sfree(encoded);
        }
        midend_free_params(me(), params);
        return result;
    }

    // Returns undefined if successful, else error message.
    // (This is not a property setter.)
    [[nodiscard]] std::optional<std::string> setGameId(const std::string &id) const {
        auto result = midend_game_id(me(), id.c_str());
        if (result == nullptr) {
            // (midend_game_id will notify about game id change.
            // It deliberately does not alter the current params.)
            notifyGameStateChange();
        }
        return result == nullptr ? std::nullopt : std::optional<std::string>(result);
    }

    [[nodiscard]] std::string getCurrentGameId() const {
        auto game_id = midend_get_game_id(me());
        auto result = std::string(game_id);
        sfree(game_id);
        return result;
    }

    [[nodiscard]] std::optional<std::string> getRandomSeed() const {
        // TODO: this can return non-printable characters -- maybe use a byte array?
        auto random_seed = midend_get_random_seed(me());
        auto result = random_seed == nullptr
                          ? std::nullopt
                          : std::optional<std::string>(std::string(random_seed));
        sfree(random_seed);
        return result;
    }

    [[nodiscard]] bool getCanFormatAsText() const {
        // Covers game->can_format_as_text_ever and can_format_as_text_now
        return midend_can_format_as_text_now(me());
    }

    [[nodiscard]] std::optional<std::string> formatAsText() const {
        auto formatted = midend_text_format(me());
        auto result = formatted == nullptr
                          ? std::nullopt
                          : std::optional<std::string>(std::string(formatted));
        sfree(formatted);
        return result;
    }

    [[nodiscard]] std::optional<std::string> solve() const {
        auto error = midend_solve(me()); // not dynamically allocated
        if (error == nullptr) {
            notifyGameStateChange();
        }
        return error == nullptr
                   ? std::nullopt
                   : std::optional(std::string(error));
    }

    void undo() const {
        if (midend_process_key(me(), 0, 0, UI_UNDO) == PKR_SOME_EFFECT) {
            notifyGameStateChange();
        }
    }

    void redo() const {
        if (midend_process_key(me(), 0, 0, UI_REDO) == PKR_SOME_EFFECT) {
            notifyGameStateChange();
        }
    }

    // Undocumented midend functions (maybe private?):
    // void midend_supersede_game_desc(midend *me, const char *desc,
    //                                 const char *privdesc);
    // char *midend_rewrite_statusbar(midend *me, const char *text);

    [[nodiscard]] Uint8Array saveGame() const {
        WriteBuffer buffer;
        midend_serialise(me(), WriteBuffer::write_callback, &buffer);
        return buffer.finalize();
    }

    [[nodiscard]] std::optional<std::string> loadGame(const Uint8Array &data) const {
        ReadBuffer buffer(data);
        const auto error = midend_deserialise(me(), ReadBuffer::read_callback, &buffer);
        if (error) {
            // midend_deserialise returns a static string on error
            return std::string(error);
        }
        // Successful load; midend has already called notify_id_changes
        notifyParamsChange(); // (may have changed; doesn't hurt to notify either way)
        notifyGameStateChange();
        return std::nullopt;
    }

    [[nodiscard]] OptionalRect getCursorLocation() const {
        int x, y, w, h;
        if (midend_get_cursor_location(me(), &x, &y, &w, &h))
            return Rect(x, y, w, h);
        else
            return std::nullopt;
    }

    // ???: int midend_tilesize(midend *me);
    // (only seems useful with midend_which_game(me)->preferred_tilesize)

    // ??? printing?
    // const char *midend_print_puzzle(midend *me, document *doc, bool with_soln);

    //
    // Frontend APIs used by the midend, as callbacks into JS
    //

    void activate_timer() const {
        (void) activateTimer();
    }

    void deactivate_timer() const {
        (void) deactivateTimer();
    }

    void frontend_default_colour(float *output) const {
        assert(defaultBackgroundIsValid); // else not in getColourPalette()
        *output++ = defaultBackground.r;
        *output++ = defaultBackground.g;
        *output = defaultBackground.b;
    }

    //
    // Certain drawing APIs not related to JS Drawing object
    //

    void status_bar(const char *text) {
        statusbarText = text;
        auto notification = NotifyStatusBarChange(text);
        notifyChange(notification);
    }

    [[nodiscard]] char *text_fallback(const char *const *strings, int nstrings) const {
        auto val_strings = std::vector<val>();
        val_strings.reserve(nstrings);
        for (const auto *str: std::span(strings, nstrings))
            val_strings.emplace_back(val::u8string(str));
        auto string_list = val::array(val_strings).as<StringList>();
        const auto result = textFallback(string_list).as<std::string>();
        return dupstr(result.c_str());
    }
};

EMSCRIPTEN_BINDINGS(frontend) {
    register_type<Uint8Array>("Uint8Array");

    value_object<PresetMenuEntry>("PresetMenuEntry")
        .field("title", &PresetMenuEntry::title)
        .field("params", &PresetMenuEntry::params)
        .field("submenu", &PresetMenuEntry::submenu);

    register_type<PresetMenuEntryList>("PresetMenuEntry[]");
    register_optional<PresetMenuEntryList>();

    register_type<ConfigDescription>(R"({
        title: string;
        items: {
            [id: string]:
                | { type: "string"; name: string; }
                | { type: "boolean", name: string; }
                | { type: "choices", name: string, choicenames: string[]; }
        };
    })");
    register_type<ConfigValues>("Record<string, string | boolean | number>");
    register_type<ConfigValuesIn>("Record<string, string | boolean | number | undefined | null>");

    register_type<ActivateTimerFunc>("() => void");
    register_type<DeactivateTimerFunc>("() => void");
    register_type<TextFallbackFunc>("(options: string[]) => string");
    value_object<FrontendConstructorArgs>("FrontendConstructorArgs")
        .field("activateTimer", &FrontendConstructorArgs::activateTimer)
        .field("deactivateTimer", &FrontendConstructorArgs::deactivateTimer)
        .field("textFallback", &FrontendConstructorArgs::textFallback)
        .field("notifyChange", &FrontendConstructorArgs::notifyChange);

    // ReSharper disable once CppExpressionWithoutSideEffects
    class_<frontend>("Frontend")
        .constructor<const FrontendConstructorArgs &>()
        .function("setDrawing(drawing)", &frontend::setDrawing, return_value_policy::reference())
        .property("name", &frontend::getName)
        .property("canConfigure", &frontend::getCanConfigure)
        .property("canSolve", &frontend::getCanSolve)
        .property("needsRightButton", &frontend::getNeedsRightButton)
        .function("size(maxSize, isUserSize, devicePixelRatio)", &frontend::size)
        .function("resetTileSize", &frontend::resetTileSize)
        .function("newGame", &frontend::newGame)
        .function("restartGame", &frontend::restartGame)
        .function("processKey(x, y, button)", &frontend::processKey)
        .property("statusbarText", &frontend::getStatusbarText)
        .function("requestKeys", &frontend::requestKeys)
        .function("currentKeyLabel(button)", &frontend::currentKeyLabel)
        .function("forceRedraw", &frontend::forceRedraw)
        .function("redraw", &frontend::redraw)
        .function("getColourPalette(defaultBackground)", &frontend::getColourPalette)
        .function("freezeTimer(tprop)", &frontend::freezeTimer)
        .function("timer(tplus)", &frontend::timer)
        .property("wantsStatusbar", &frontend::getWantsStatusbar)
        .function("getPreferencesConfig", &frontend::getPreferencesConfig)
        .function("getPreferences", &frontend::getPreferences)
        .function("setPreferences(values)", &frontend::setPreferences)
        .function("savePreferences", &frontend::savePreferences)
        .function("loadPreferences(data)", &frontend::loadPreferences)
        .function("getParams", &frontend::getParams)
        .function("setParams(params)", &frontend::setParams)
        .function("getPresets", &frontend::getPresets)
        .function("getCustomParamsConfig", &frontend::getCustomParamsConfig)
        .function("getCustomParams()", &frontend::getCustomParams)
        .function("setCustomParams(values)", &frontend::setCustomParams)
        .function("encodeCustomParams(values)", &frontend::encodeCustomParams)
        .function("setGameId(id)", &frontend::setGameId)
        .property("currentGameId", &frontend::getCurrentGameId)
        .property("randomSeed", &frontend::getRandomSeed)
        .property("canFormatAsText", &frontend::getCanFormatAsText)
        .function("formatAsText", &frontend::formatAsText)
        .function("solve", &frontend::solve)
        .function("undo", &frontend::undo)
        .function("redo", &frontend::redo)
        .function("saveGame", &frontend::saveGame)
        .function("loadGame(data)", &frontend::loadGame)
        .function("getCursorLocation", &frontend::getCursorLocation);
}

Drawing *DRAWING(const drawing *dr) {
    auto const fe = static_cast<frontend *>(dr->handle);
    if (fe->drawing == nullptr) {
        throw_js_error("Drawing API called before setDrawing()");
    }
    return fe->drawing;
}

// These two drawing_api functions aren't really canvas-specific (and may
// need to run before the canvas is installed), so treat them as part of frontend
// or Frontend rather than Drawing.

void js_status_bar(drawing *dr, const char *text) {
    static_cast<frontend *>(dr->handle)->status_bar(text);
}

char *js_text_fallback(drawing *dr, const char *const *strings, int nstrings) {
    return static_cast<frontend *>(dr->handle)->text_fallback(strings, nstrings);
}

static constexpr drawing_api js_drawing_api = {
    1, // version
    js_draw_text,
    js_draw_rect,
    js_draw_line,
    js_draw_polygon,
    js_draw_circle,
    js_draw_update,
    js_clip,
    js_unclip,
    js_start_draw,
    js_end_draw,
    js_status_bar,
    js_blitter_new,
    js_blitter_free,
    js_blitter_save,
    js_blitter_load,
    // Unimplemented printing API
    nullptr, // begin_doc
    nullptr, // begin_page
    nullptr, // begin_puzzle
    nullptr, // end_puzzle
    nullptr, // end_page
    nullptr, // end_doc
    nullptr, // line_width
    nullptr, // line_dotted
    js_text_fallback,
    js_draw_thick_line,
};

const drawing_api *get_js_drawing_api() {
    return &js_drawing_api;
}

extern "C" {
    // Implement the C frontend functions used by the midend

    void activate_timer(frontend *fe) {
        fe->activate_timer();
    }

    void deactivate_timer(frontend *fe) {
        fe->deactivate_timer();
    }

    void frontend_default_colour(frontend *fe, float *output) {
        fe->frontend_default_colour(output);
    }

    // get_random_seed implementation borrowed from upstream emcc.c/emcclib.js.
    EM_JS(void, js_get_date_64, (int64_t *ptr), {
        setValue(ptr, Date.now(), 'i64');
    });
    void get_random_seed(void **randseed, int *randseedsize) {
        auto *ret = snewn(1, int64_t);
        js_get_date_64(ret);
        *randseed = ret;
        *randseedsize = sizeof(int64_t);
    }

    void fatal(const char *fmt, ...) {
        char buf[512];
        va_list ap;

        va_start(ap, fmt);
        vsnprintf(buf, sizeof(buf), fmt, ap);
        va_end(ap);

        throw_js_error(buf);
    }
} // extern "C"

