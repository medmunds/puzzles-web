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
struct NotifyGameIdChange {
    NotifyGameIdChangeType type = val::u8string("game-id-change").as<NotifyGameIdChangeType>();

    std::string currentGameId;
    std::optional<std::string> randomSeed = std::nullopt;

    NotifyGameIdChange() = default;

    explicit NotifyGameIdChange(midend *me) {
        auto const game_id = midend_get_game_id(me);
        this->currentGameId = std::string(game_id);
        sfree(game_id);

        auto const random_seed = midend_get_random_seed(me);
        this->randomSeed = random_seed == nullptr
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
struct NotifyGameStateChange {
    NotifyGameStateChangeType type = val::u8string("game-state-change").as<NotifyGameStateChangeType>();

    GameStatus status = STATUS_ONGOING();
    bool canUndo = false;
    bool canRedo = false;

    NotifyGameStateChange() = default;

    explicit NotifyGameStateChange(midend *me)
        : canUndo(midend_can_undo(me)),
          canRedo(midend_can_redo(me)) {
        auto const status = midend_status(me);
        if (status < 0) {
            this->status = STATUS_LOST();
        } else if (status > 0) {
            // TODO: separate midend status for STATUS_SOLVED_WITH_HELP()
            this->status = STATUS_SOLVED();
        } else {
            this->status = STATUS_ONGOING();
        }
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyPresetIdChangeType);
struct NotifyPresetIdChange {
    NotifyPresetIdChangeType type = val::u8string("preset-id-change").as<NotifyPresetIdChangeType>();

    std::optional<int> presetId = std::nullopt;

    NotifyPresetIdChange() = default;

    explicit NotifyPresetIdChange(midend *me) {
        auto const preset_id= midend_which_preset(me);
        this->presetId = preset_id < 0 ? std::nullopt : std::optional(preset_id);
    }
};

EMSCRIPTEN_DECLARE_VAL_TYPE(NotifyStatusBarChangeType);
struct NotifyStatusBarChange {
    NotifyStatusBarChangeType type = val::u8string("status-bar-change").as<NotifyStatusBarChangeType>();
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
        .field("canUndo", &NotifyGameStateChange::canUndo)
        .field("canRedo", &NotifyGameStateChange::canRedo);

    register_type<NotifyPresetIdChangeType>("\"preset-id-change\"");
    value_object<NotifyPresetIdChange>("NotifyPresetIdChange")
        .field("type", &NotifyPresetIdChange::type)
        .field("presetId", &NotifyPresetIdChange::presetId);

    register_type<NotifyStatusBarChangeType>("\"status-bar-change\"");
    value_object<NotifyStatusBarChange>("NotifyStatusBarChange")
        .field("type", &NotifyStatusBarChange::type)
        .field("statusBarText", &NotifyStatusBarChange::statusBarText);

    // (Must inline the Notification union to get Emscripten to emit it.)
    register_type<NotifyCallbackFunc>(R"(
        (message:
            | NotifyGameIdChange
            | NotifyGameStateChange
            | NotifyPresetIdChange
            | NotifyStatusBarChange
        ) => void
    )");
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
    int id;
    std::string title;
    OptionalPresetMenuEntryList submenu;

    PresetMenuEntry() : id(-1), submenu(std::nullopt) {}

    explicit PresetMenuEntry(const preset_menu_entry &preset) : id(preset.id),
        title(preset.title),
        submenu(
            preset.submenu == nullptr
                ? std::nullopt
                : OptionalPresetMenuEntryList(build_menu(preset.submenu))
        ) {}

    static PresetMenuEntryList build_menu(const preset_menu *menu) {
        auto entries = std::span(menu->entries, menu->n_entries);
        auto menu_vec = std::vector<PresetMenuEntry>();
        for (auto &entry: entries) { menu_vec.emplace_back(entry); }
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

        // Notify the default preset ID.
        // (midend_which_preset isn't valid until midend_get_presets has been called.)
        midend_get_presets(me(), nullptr);
        this->notifyPresetIdChange();
    }

    void setDrawing(Drawing *drawing) { this->drawing = drawing; }

private:
    // midend_request_id_changes callback
    static void notify_id_changes(void *ctx) {
        static_cast<frontend *>(ctx)->notifyGameIdChange();
    }

    void notifyGameIdChange() const {
        auto message = NotifyGameIdChange(me());
        this->notifyChange(message);
    }

    void notifyGameStateChange() const {
        auto message = NotifyGameStateChange(me());
        this->notifyChange(message);
    }

    void notifyPresetIdChange() const {
        auto message = NotifyPresetIdChange(me());
        this->notifyChange(message);
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

    // We don't expose:
    //   void midend_set_params(midend *me, game_params *params);
    //   game_params *midend_get_params(midend *me);
    // Although game_params* can be wrapped in a ClassHandle, it's added complexity
    // and doesn't really offer any frontend value. (There's no way to serialise
    // or restore game_params directly.) Use setPreset(id) to set params for a
    // preset menu entry, or setGameId(customTypePrefix) to restore custom params.

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
        this->notifyGameStateChange();
    }

    void restartGame() const {
        midend_restart_game(me());
        this->notifyGameStateChange();
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
                this->notifyGameStateChange();
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

    [[nodiscard]] std::string getStatusbarText() const { return this->statusbarText; }

    void forceRedraw() const {
        if (this->drawing != nullptr)
            midend_force_redraw(me());
    }

    void redraw() const {
        if (this->drawing != nullptr)
            midend_redraw(me());
    }

    [[nodiscard]] ColourList getColourPalette(const Colour& defaultBackground) {
        this->defaultBackground = defaultBackground;
        this->defaultBackgroundIsValid = true;

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

        this->defaultBackgroundIsValid = false;
        return val::array(colours_vec).as<ColourList>();
    }

    void freezeTimer(float tprop) const { midend_freeze_timer(me(), tprop); }

    void timer(float tplus) const { midend_timer(me(), tplus); }

    [[nodiscard]] PresetMenuEntryList getPresets() const {
        auto *presets = midend_get_presets(me(), nullptr);
        return PresetMenuEntry::build_menu(presets);
    }

    [[nodiscard]] std::optional<int> getCurrentPreset() const {
        auto result = midend_which_preset(me());
        return result < 0 ? std::nullopt : std::optional<int>(result);
    }

    // Use the game_params for the given preset menu entry
    void setPreset(int preset_id) const {
        const auto preset_menu = midend_get_presets(me(), nullptr);
        if (const auto params = preset_menu_lookup_by_id(preset_menu, preset_id)) {
            midend_set_params(me(), params);
            this->notifyPresetIdChange();
        }
        // TODO: else throw? return an error string?
    }

    [[nodiscard]] bool getWantsStatusbar() const {
        return midend_wants_statusbar(me());
    }

private:
    static std::string config_item_id(const int which, const config_item *item) {
        // CFG_PREFS have keywords defined.
        if (which == CFG_PREFS) {
            return item->kw;
        }
        // CFG_SETTINGS and other CFG types don't use kw (and leave it uninitialized).
        // Use the slugified name instead.
        return slugify(item->name);
    }

    [[nodiscard]] ConfigDescription build_config_description(const int which) const {
        char *wintitle;
        auto *config_items = midend_get_config(me(), which, &wintitle);

        auto config = val::object();
        config.set("title", std::string(wintitle));

        auto items = val::object();
        // Process config items until we hit C_END
        for (config_item *config_item = config_items; config_item->type != C_END; config_item++) {
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

            auto id = config_item_id(which, config_item);
            items.set(id, item);
        }

        free_cfg(config_items);
        sfree(wintitle);

        config.set("items", items);
        return config.as<ConfigDescription>();
    }

    [[nodiscard]] ConfigValues get_config_values(const int which) const {
        char *wintitle;
        auto *config_items = midend_get_config(me(), which, &wintitle);

        auto values = val::object();
        for (config_item *config_item = config_items; config_item->type != C_END; config_item++) {
            auto id = config_item_id(which, config_item);
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

        free_cfg(config_items);
        sfree(wintitle);
        return values.as<ConfigValues>();
    }

    [[nodiscard]] std::optional<std::string> set_config_values(
        const int which, const ConfigValuesIn &values
    ) const {
        char *wintitle;
        auto *config_items = midend_get_config(me(), which, &wintitle);

        for (config_item *config_item = config_items; config_item->type != C_END; config_item++) {
            auto id = config_item_id(which, config_item);
            auto value = values[id];
            if (value.isUndefined() || value.isNull()) {
                // Keep current value for this config_item
                continue;
            }

            switch (config_item->type) {
                case C_STRING:
                    sfree(config_item->u.string.sval); // free original value
                    config_item->u.string.sval = dupstr(value.as<std::string>().c_str());
                    break;
                case C_BOOLEAN:
                    config_item->u.boolean.bval = value.as<bool>();
                    break;
                case C_CHOICES:
                    config_item->u.choices.selected = value.as<int>();
                    break;
                default:
                    break;
            }
        }

        auto result = midend_set_config(me(), which, config_items);
        free_cfg(config_items);
        sfree(wintitle);
        return result == nullptr ? std::nullopt : std::optional<std::string>(result);
    }

public:
    [[nodiscard]] ConfigDescription getPreferencesConfig() const {
        return this->build_config_description(CFG_PREFS);
    }

    [[nodiscard]] ConfigValues getPreferences() const {
        return this->get_config_values(CFG_PREFS);
    }

    [[nodiscard]] std::optional<std::string> setPreferences(
        const ConfigValuesIn &values
    ) const {
        return this->set_config_values(CFG_PREFS, values);
    }

    [[nodiscard]] ConfigDescription getCustomParamsConfig() const {
        return this->build_config_description(CFG_SETTINGS);
    }

    [[nodiscard]] ConfigValues getCustomParams() const {
        return this->get_config_values(CFG_SETTINGS);
    }

    [[nodiscard]] std::optional<std::string> setCustomParams(
        const ConfigValuesIn &values
    ) const {
        auto result = this->set_config_values(CFG_SETTINGS, values);
        if (result == std::nullopt) {
            this->notifyPresetIdChange();
        }
        return result;
    }

    // Returns undefined if successful, else error message.
    // (This is not a property setter.)
    [[nodiscard]] std::optional<std::string> setGameId(const std::string &id) const {
        auto result = midend_game_id(me(), id.c_str());
        if (result == nullptr) {
            // (midend_game_id will notify about game id change.
            // It deliberately does not alter the current preset type.)
            this->notifyGameStateChange();
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
            this->notifyGameStateChange();
        }
        return error == nullptr
                   ? std::nullopt
                   : std::optional(std::string(error));
    }

    void undo() const {
        if (midend_process_key(me(), 0, 0, UI_UNDO) == PKR_SOME_EFFECT) {
            this->notifyGameStateChange();
        }
    }

    void redo() const {
        if (midend_process_key(me(), 0, 0, UI_REDO) == PKR_SOME_EFFECT) {
            this->notifyGameStateChange();
        }
    }

    // Undocumented midend functions (maybe private?):
    // void midend_supersede_game_desc(midend *me, const char *desc,
    //                                 const char *privdesc);
    // char *midend_rewrite_statusbar(midend *me, const char *text);

    // TODO: implement serialisation and preferences
    // void midend_serialise(midend *me,
    //                       void (*write)(void *ctx, const void *buf, int len),
    //                       void *wctx);
    // const char *midend_deserialise(midend *me,
    //                                bool (*read)(void *ctx, void *buf, int len),
    //                                void *rctx);
    // const char *midend_load_prefs(
    //     midend *me, bool (*read)(void *ctx, void *buf, int len), void *rctx);
    // void midend_save_prefs(midend *me,
    //                        void (*write)(void *ctx, const void *buf, int len),
    //                        void *wctx);

    // TODO: implement id change callbacks
    //   void midend_request_id_changes(midend *me, void (*notify)(void *), void *ctx);

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
        (void) this->activateTimer();
    }

    void deactivate_timer() const {
        (void) this->deactivateTimer();
    }

    void frontend_default_colour(float *output) const {
        assert(this->defaultBackgroundIsValid); // else not in getColourPalette()
        *output++ = this->defaultBackground.r;
        *output++ = this->defaultBackground.g;
        *output = this->defaultBackground.b;
    }

    //
    // Certain drawing APIs not related to JS Drawing object
    //

    void status_bar(const char *text) {
        this->statusbarText = text;
        auto notification = NotifyStatusBarChange(text);
        this->notifyChange(notification);
    }

    [[nodiscard]] char *text_fallback(const char *const *strings, int nstrings) const {
        auto val_strings = std::vector<val>();
        val_strings.reserve(nstrings);
        for (const auto *str: std::span(strings, nstrings))
            val_strings.emplace_back(val::u8string(str));
        auto string_list = val::array(val_strings).as<StringList>();
        const auto result = this->textFallback(string_list).as<std::string>();
        return dupstr(result.c_str());
    }
};

EMSCRIPTEN_BINDINGS(frontend) {
    value_object<PresetMenuEntry>("PresetMenuEntry")
        .field("id", &PresetMenuEntry::id)
        .field("title", &PresetMenuEntry::title)
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
        .function("getPresets", &frontend::getPresets)
        .property("currentPreset", &frontend::getCurrentPreset)
        .function("setPreset(id)", &frontend::setPreset)
        .property("wantsStatusbar", &frontend::getWantsStatusbar)
        .function("getPreferencesConfig", &frontend::getPreferencesConfig)
        .function("getPreferences", &frontend::getPreferences)
        .function("setPreferences(values)", &frontend::setPreferences)
        .function("getCustomParamsConfig", &frontend::getCustomParamsConfig)
        .function("getCustomParams", &frontend::getCustomParams)
        .function("setCustomParams(values)", &frontend::setCustomParams)
        .function("setGameId(id)", &frontend::setGameId)
        .property("currentGameId", &frontend::getCurrentGameId)
        .property("randomSeed", &frontend::getRandomSeed)
        .property("canFormatAsText", &frontend::getCanFormatAsText)
        .function("formatAsText", &frontend::formatAsText)
        .function("solve", &frontend::solve)
        .function("undo", &frontend::undo)
        .function("redo", &frontend::redo)
        // TODO: serialisation
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

