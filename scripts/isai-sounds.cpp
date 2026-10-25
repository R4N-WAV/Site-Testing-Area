// The site's recorded sounds (assets/sound/*.mp3): short one-shots played on R4N's synth Isai,
// through its own effects chain, written as 32-bit float stereo WAVs.
//
//   in a checkout of R4N-WAV/Isai:
//   g++ -O2 -std=c++17 -I Source/Engine -I Source <this file> Source/Engine/*.cpp Source/Tape/TakeRules.cpp -o isai-sounds
//   ./isai-sounds toggle toggle.wav        (toggle morph chime dive rise thump open close)
//   then, for each: mono, trim the silence, loudness -20 LUFS, -3 dB peaks, 64 kbit/s mp3:
//   ffmpeg -i toggle.wav -af "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=40,silenceremove=start_periods=1:start_threshold=-75dB,afade=t=in:d=0.004,loudnorm=I=-20:TP=-3:LRA=11,areverse,silenceremove=start_periods=1:start_threshold=-60dB,afade=t=in:d=0.03,areverse" -ar 44100 -c:a libmp3lame -b:a 64k toggle.mp3
#include "Engine.h"
#include "FxChain.h"
#include "PanelFields.h"
#include <cmath>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <functional>
#include <string>
#include <vector>
using namespace isai;

struct Ev { double at; int note; bool on; double vel; };
struct Patch { PanelState p; std::vector<Ev> evs; double seconds; std::function<void (PanelState&, double)> sweep; };

static bool writeWav (const std::string& path, const std::vector<float>& l, const std::vector<float>& r, int rate)
{
    FILE* f = std::fopen (path.c_str(), "wb"); if (! f) return false;
    auto u32 = [f] (uint32_t v) { std::fwrite (&v, 4, 1, f); }; auto u16 = [f] (uint16_t v) { std::fwrite (&v, 2, 1, f); };
    const uint32_t n = (uint32_t) l.size(), bytes = n * 8;
    std::fwrite ("RIFF", 1, 4, f); u32 (36 + bytes); std::fwrite ("WAVE", 1, 4, f);
    std::fwrite ("fmt ", 1, 4, f); u32 (16); u16 (3); u16 (2); u32 (rate); u32 (rate * 8); u16 (8); u16 (32);
    std::fwrite ("data", 1, 4, f); u32 (bytes);
    for (uint32_t i = 0; i < n; ++i) { std::fwrite (&l[i], 4, 1, f); std::fwrite (&r[i], 4, 1, f); }
    std::fclose (f); return true;
}

static PanelState base()
{
    PanelState p = initPatch();
    p.volume = 7; p.release = true;
    return p;
}

static Patch make (const std::string& name)
{
    Patch k; k.p = base(); k.seconds = 1.2;
    PanelState& p = k.p;
    auto pluck = [&] (double cutoff, double decay) {
        p.mixOscA = 8; p.mixOscB = 0; p.oscASaw = false; p.oscATri = true;
        p.cutoff = cutoff; p.resonance = 1; p.envAmount = 4; p.filterKbd = true;
        p.fAttack = 0; p.fDecay = decay; p.fSustain = 0; p.fRelease = decay;
        p.aAttack = 1.2; p.aDecay = decay; p.aSustain = 0; p.aRelease = decay;
        p.reverbOn = true; p.reverbDecay = 3.5; p.reverbMix = 2.2; p.reverbTone = 4;
    };
    if (name == "toggle") { pluck (3.2, 2.2); k.evs = { { 0, 69, true, 0.8 }, { 0.07, 69, false, 0 }, { 0.08, 76, true, 0.7 }, { 0.15, 76, false, 0 } }; k.seconds = 0.9; }
    else if (name == "morph") { pluck (3.6, 1.6); double t = 0; int ns[] = { 81, 84, 79, 83, 86, 80 }; for (int n : ns) { k.evs.push_back ({ t, n, true, 0.55 }); k.evs.push_back ({ t + 0.03, n, false, 0 }); t += 0.055; } k.seconds = 1.0; }
    else if (name == "chime") { // a warm swell: two detuned saws through a slow filter, plate
        p.mixOscA = 7; p.mixOscB = 6; p.oscBFine = 5.4; p.oscBSaw = true;
        p.cutoff = 2.6; p.resonance = 1.5; p.envAmount = 3; p.fAttack = 4; p.fDecay = 6; p.fSustain = 3; p.fRelease = 6;
        p.aAttack = 3.6; p.aDecay = 6; p.aSustain = 6; p.aRelease = 6.2;
        p.chorus2 = true; p.reverbOn = true; p.reverbDecay = 6; p.reverbMix = 4; p.reverbTone = 4;
        k.evs = { { 0, 57, true, 0.7 }, { 0, 64, true, 0.6 }, { 0, 69, true, 0.6 }, { 0.6, 57, false, 0 }, { 0.6, 64, false, 0 }, { 0.6, 69, false, 0 } }; k.seconds = 2.6; }
    else if (name == "dive" || name == "rise") { // filtered noise and a low drone, the filter sweeping
        p.mixOscA = 3; p.mixOscB = 0; p.mixNoise = 9; p.oscASaw = true;
        p.resonance = 3.5; p.envAmount = 0; p.filterKbd = false;
        p.aAttack = name == "dive" ? 5.4 : 2.6; p.aDecay = 6; p.aSustain = 9; p.aRelease = 5.6;
        p.chorus3 = true; p.reverbOn = true; p.reverbDecay = 5; p.reverbMix = 3.5;
        const bool up = name == "dive";
        k.sweep = [up] (PanelState& q, double t) { double x = std::fmin (1.0, t / 0.9); q.cutoff = up ? 1.0 + 6.5 * x * x : 7.5 - 6.5 * std::sqrt (x); };
        k.evs = { { 0, 33, true, 0.8 }, { 0.75, 33, false, 0 } }; k.seconds = 1.9; }
    else if (name == "thump") { // a low, felted body knock: a triangle pinged low, a breath of noise, a short room
        pluck (2.6, 1.9); p.mixNoise = 1.5; p.reverbMix = 1.2;
        k.evs = { { 0, 40, true, 0.9 }, { 0.06, 40, false, 0 } }; k.seconds = 0.6; }
    else if (name == "open" || name == "close") { // a soft breathy swish with a low tone under it
        p.mixOscA = 2; p.mixNoise = 8; p.mixOscB = 0; p.resonance = 2; p.envAmount = 6; p.filterKbd = false;
        p.cutoff = name == "open" ? 2.5 : 4.5; p.fAttack = name == "open" ? 3.2 : 0; p.fDecay = 3.4; p.fSustain = 0; p.fRelease = 3;
        p.aAttack = name == "open" ? 2.6 : 2.0; p.aDecay = 3.4; p.aSustain = 0; p.aRelease = 3.2;
        p.reverbOn = true; p.reverbDecay = 3.5; p.reverbMix = 2.5;
        k.evs = { { 0, 45, true, 0.8 }, { 0.2, 45, false, 0 } }; k.seconds = 1.1; }
    return k;
}

int main (int argc, char** argv)
{
    if (argc < 3) { std::fprintf (stderr, "usage: render <name> <out.wav>\n"); return 1; }
    const int rate = 48000, block = 64;
    Patch k = make (argv[1]);
    Engine e; e.prepare (rate, block, 4); e.setAnalogLife (true);
    FxChain fx; fx.prepare (rate);
    e.setPanel (withMacros (k.p)); fx.set (k.p, 120);
    // let the panel settle before any note
    std::vector<float> L (block), R (block);
    for (int i = 0; i < rate / 4 / block; ++i) e.render (L.data(), R.data(), block);
    const int total = (int) (k.seconds * rate);
    std::vector<float> outL, outR; outL.reserve (total); outR.reserve (total);
    size_t next = 0;
    for (int s = 0; s < total; s += block)
    {
        const double t = (double) s / rate;
        while (next < k.evs.size() && k.evs[next].at <= t) { auto& ev = k.evs[next++]; if (ev.on) e.noteOn (ev.note, ev.vel); else e.noteOff (ev.note); }
        if (k.sweep) { PanelState q = k.p; k.sweep (q, t); e.setPanel (withMacros (q)); }
        e.render (L.data(), R.data(), block);
        fx.process (L.data(), R.data(), block);
        outL.insert (outL.end(), L.begin(), L.end()); outR.insert (outR.end(), R.begin(), R.end());
    }
    return writeWav (argv[2], outL, outR, rate) ? 0 : 2;
}
