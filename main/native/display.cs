// Display controls for syshelper.exe: resolution, refresh rate, primary display,
// multi-monitor mode, Windows DPI scale, "game colors" (gamma / contrast /
// brightness, plus NVIDIA digital vibrance) and Windows' variable refresh rate.
//
// Written for the .NET Framework 4 compiler that ships with Windows (C# 5):
// no string interpolation, no ?. and no expression-bodied members.
//
// build.cmd compiles this file together with syshelper.cs.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace PlayOSX
{
    static class Display
    {
        /* -------------------------------------------------------------- */
        /* Win32                                                           */
        /* -------------------------------------------------------------- */

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DEVMODE
        {
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
            public short dmSpecVersion, dmDriverVersion, dmSize, dmDriverExtra;
            public int dmFields;
            public int dmPositionX, dmPositionY;
            public int dmDisplayOrientation, dmDisplayFixedOutput;
            public short dmColor, dmDuplex, dmYResolution, dmTTOption, dmCollate;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
            public short dmLogPixels;
            public int dmBitsPerPel, dmPelsWidth, dmPelsHeight, dmDisplayFlags, dmDisplayFrequency;
            public int dmICMMethod, dmICMIntent, dmMediaType, dmDitherType, dmReserved1, dmReserved2, dmPanningWidth, dmPanningHeight;
        }

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct DISPLAY_DEVICE
        {
            public int cb;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
            public int StateFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
        }

        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplayDevices(string device, uint index, ref DISPLAY_DEVICE dd, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern bool EnumDisplaySettingsEx(string device, int mode, ref DEVMODE dm, uint flags);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "ChangeDisplaySettingsExW")] static extern int ChangeDisplaySettingsEx(string device, ref DEVMODE dm, IntPtr hwnd, uint flags, IntPtr lParam);
        [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "ChangeDisplaySettingsExW")] static extern int ApplyDisplaySettings(string device, IntPtr dm, IntPtr hwnd, uint flags, IntPtr lParam);
        [DllImport("user32.dll")] static extern int GetDisplayConfigBufferSizes(uint flags, out uint paths, out uint modes);
        [DllImport("user32.dll")] static extern int QueryDisplayConfig(uint flags, ref uint paths, IntPtr pathArray, ref uint modes, IntPtr modeArray, IntPtr topology);
        [DllImport("user32.dll")] static extern int DisplayConfigGetDeviceInfo(IntPtr packet);
        [DllImport("user32.dll")] static extern int DisplayConfigSetDeviceInfo(IntPtr packet);
        [DllImport("user32.dll")] static extern int SetDisplayConfig(uint numPaths, IntPtr paths, uint numModes, IntPtr modes, uint flags);
        [DllImport("gdi32.dll", CharSet = CharSet.Unicode)] static extern IntPtr CreateDC(string driver, string device, string port, IntPtr data);
        [DllImport("gdi32.dll")] static extern bool DeleteDC(IntPtr hdc);
        [DllImport("gdi32.dll")] static extern bool SetDeviceGammaRamp(IntPtr hdc, [In] ushort[] ramp);

        const int ENUM_CURRENT_SETTINGS = -1;
        const int DM_POSITION = 0x20, DM_BITSPERPEL = 0x40000, DM_PELSWIDTH = 0x80000, DM_PELSHEIGHT = 0x100000, DM_DISPLAYFREQUENCY = 0x400000;
        const uint CDS_UPDATEREGISTRY = 0x1, CDS_TEST = 0x2, CDS_SET_PRIMARY = 0x10, CDS_NORESET = 0x10000000;
        const int DISP_CHANGE_SUCCESSFUL = 0;
        const int DD_ATTACHED = 0x1, DD_PRIMARY = 0x4;
        const int GET_SOURCE_NAME = 1, GET_TARGET_NAME = 2, GET_DPI_SCALE = -3, SET_DPI_SCALE = -4;
        const int PathSize = 72, ModeSize = 64;

        static readonly int[] DpiSteps = { 100, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500 };

        static DEVMODE NewMode()
        {
            var dm = new DEVMODE();
            dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE));
            return dm;
        }

        static string ChangeError(int code)
        {
            switch (code)
            {
                case 1: return "Windows needs a restart to apply this";
                case -1: return "The display refused that mode";
                case -2: return "That mode is not supported by this display";
                case -3: return "Windows could not save the setting";
                case -4: return "The display driver did not accept the setting";
                case -5: return "The setting was not valid";
                default: return "Windows could not change the display (" + code + ")";
            }
        }

        /* -------------------------------------------------------------- */
        /* Which monitor is which                                          */
        /* -------------------------------------------------------------- */

        class PathInfo
        {
            public long SrcLuid; public uint SrcId;
            public long TgtLuid; public uint TgtId;
            public string Gdi; // \\.\DISPLAY1
            public string Name; // the monitor's own name
        }

        static void Fill(IntPtr packet, int type, int size, long luid, uint id)
        {
            for (int i = 0; i < size; i += 4) Marshal.WriteInt32(packet, i, 0);
            Marshal.WriteInt32(packet, 0, type);
            Marshal.WriteInt32(packet, 4, size);
            Marshal.WriteInt64(packet, 8, luid);
            Marshal.WriteInt32(packet, 16, (int)id);
        }

        static List<PathInfo> Paths()
        {
            var list = new List<PathInfo>();
            uint np, nm;
            if (GetDisplayConfigBufferSizes(2 /* QDC_ONLY_ACTIVE_PATHS */, out np, out nm) != 0 || np == 0) return list;
            IntPtr paths = Marshal.AllocHGlobal((int)np * PathSize), modes = Marshal.AllocHGlobal((int)nm * ModeSize), pkt = Marshal.AllocHGlobal(420);
            try
            {
                if (QueryDisplayConfig(2, ref np, paths, ref nm, modes, IntPtr.Zero) != 0) return list;
                for (int i = 0; i < np; i++)
                {
                    IntPtr p = paths + i * PathSize;
                    var info = new PathInfo
                    {
                        // sourceInfo: adapter LUID at +0, id at +8. targetInfo: LUID at +20, id at +28.
                        SrcLuid = Marshal.ReadInt64(p, 0), SrcId = (uint)Marshal.ReadInt32(p, 8),
                        TgtLuid = Marshal.ReadInt64(p, 20), TgtId = (uint)Marshal.ReadInt32(p, 28),
                    };
                    Fill(pkt, GET_SOURCE_NAME, 84, info.SrcLuid, info.SrcId);
                    if (DisplayConfigGetDeviceInfo(pkt) == 0) info.Gdi = Marshal.PtrToStringUni(pkt + 20);
                    Fill(pkt, GET_TARGET_NAME, 420, info.TgtLuid, info.TgtId);
                    if (DisplayConfigGetDeviceInfo(pkt) == 0) info.Name = Marshal.PtrToStringUni(pkt + 36);
                    list.Add(info);
                }
            }
            catch { }
            finally
            {
                Marshal.FreeHGlobal(paths);
                Marshal.FreeHGlobal(modes);
                Marshal.FreeHGlobal(pkt);
            }
            return list;
        }

        class Attached { public string Device; public bool Primary; public string Card; }

        static List<Attached> AttachedDisplays()
        {
            var list = new List<Attached>();
            for (uint i = 0; ; i++)
            {
                var dd = new DISPLAY_DEVICE();
                dd.cb = Marshal.SizeOf(typeof(DISPLAY_DEVICE));
                if (!EnumDisplayDevices(null, i, ref dd, 0)) break;
                if ((dd.StateFlags & DD_ATTACHED) == 0) continue;
                list.Add(new Attached { Device = dd.DeviceName, Primary = (dd.StateFlags & DD_PRIMARY) != 0, Card = dd.DeviceString });
            }
            return list;
        }

        static string Resolve(string device)
        {
            var all = AttachedDisplays();
            if (!string.IsNullOrEmpty(device) && all.Any(a => a.Device == device)) return device;
            var primary = all.FirstOrDefault(a => a.Primary);
            return primary != null ? primary.Device : (all.Count > 0 ? all[0].Device : null);
        }

        /* -------------------------------------------------------------- */
        /* Everything the settings page shows                              */
        /* -------------------------------------------------------------- */

        public static object Info()
        {
            var paths = Paths();
            var result = new List<object>();
            foreach (var a in AttachedDisplays())
            {
                var cur = NewMode();
                if (!EnumDisplaySettingsEx(a.Device, ENUM_CURRENT_SETTINGS, ref cur, 0)) continue;

                var seen = new HashSet<string>();
                var modes = new List<object>();
                for (int i = 0; ; i++)
                {
                    var dm = NewMode();
                    if (!EnumDisplaySettingsEx(a.Device, i, ref dm, 0)) break;
                    if (dm.dmBitsPerPel < 32 || dm.dmPelsWidth < 640) continue;
                    string key = dm.dmPelsWidth + "x" + dm.dmPelsHeight + "@" + dm.dmDisplayFrequency;
                    if (!seen.Add(key)) continue;
                    modes.Add(new Dictionary<string, object> { { "width", dm.dmPelsWidth }, { "height", dm.dmPelsHeight }, { "hz", dm.dmDisplayFrequency } });
                }

                var path = paths.FirstOrDefault(p => p.Gdi == a.Device);
                var d = new Dictionary<string, object>
                {
                    { "device", a.Device },
                    { "name", path != null && !string.IsNullOrEmpty(path.Name) ? path.Name : a.Card },
                    { "primary", a.Primary },
                    { "x", cur.dmPositionX }, { "y", cur.dmPositionY },
                    { "width", cur.dmPelsWidth }, { "height", cur.dmPelsHeight }, { "hz", cur.dmDisplayFrequency },
                    { "modes", modes },
                };
                var dpi = path == null ? null : GetDpi(path);
                if (dpi != null) d["dpi"] = dpi;
                result.Add(d);
            }
            return new Dictionary<string, object>
            {
                { "displays", result },
                { "topology", GetTopology() },
                { "vrr", GetVrr() },
                { "vibrance", Vibrance.Info() },
            };
        }

        /* -------------------------------------------------------------- */
        /* Resolution and refresh rate                                     */
        /* -------------------------------------------------------------- */

        /// <summary>Resolution and refresh rate of one display (hz 0 = keep the current one).</summary>
        public static object SetMode(string device, int width, int height, int hz)
        {
            device = Resolve(device);
            if (device == null) throw new InvalidOperationException("No display found");
            var dm = NewMode();
            if (!EnumDisplaySettingsEx(device, ENUM_CURRENT_SETTINGS, ref dm, 0)) throw new InvalidOperationException("Could not read the display");
            if (width > 0) dm.dmPelsWidth = width;
            if (height > 0) dm.dmPelsHeight = height;
            if (hz > 0) dm.dmDisplayFrequency = hz;
            dm.dmFields = DM_PELSWIDTH | DM_PELSHEIGHT | DM_DISPLAYFREQUENCY | DM_BITSPERPEL;

            // Ask first, so a mode the display cannot show never blanks the screen.
            int test = ChangeDisplaySettingsEx(device, ref dm, IntPtr.Zero, CDS_TEST, IntPtr.Zero);
            if (test != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException(ChangeError(test));
            int r = ChangeDisplaySettingsEx(device, ref dm, IntPtr.Zero, CDS_UPDATEREGISTRY, IntPtr.Zero);
            if (r != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException(ChangeError(r));
            return true;
        }

        /* -------------------------------------------------------------- */
        /* Main display and multi-monitor                                  */
        /* -------------------------------------------------------------- */

        /// <summary>Makes one display the main one. Windows wants it at (0,0), so the others are moved by the same amount.</summary>
        public static object SetPrimary(string device)
        {
            var all = AttachedDisplays();
            if (!all.Any(a => a.Device == device)) throw new InvalidOperationException("That display is not connected");
            var target = NewMode();
            if (!EnumDisplaySettingsEx(device, ENUM_CURRENT_SETTINGS, ref target, 0)) throw new InvalidOperationException("Could not read the display");
            int dx = target.dmPositionX, dy = target.dmPositionY;

            foreach (var a in all)
            {
                var dm = NewMode();
                if (!EnumDisplaySettingsEx(a.Device, ENUM_CURRENT_SETTINGS, ref dm, 0)) continue;
                dm.dmPositionX -= dx;
                dm.dmPositionY -= dy;
                dm.dmFields = DM_POSITION;
                uint flags = CDS_UPDATEREGISTRY | CDS_NORESET | (a.Device == device ? CDS_SET_PRIMARY : 0);
                int r = ChangeDisplaySettingsEx(a.Device, ref dm, IntPtr.Zero, flags, IntPtr.Zero);
                if (r != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException(ChangeError(r));
            }
            int apply = ApplyDisplaySettings(null, IntPtr.Zero, IntPtr.Zero, 0, IntPtr.Zero);
            if (apply != DISP_CHANGE_SUCCESSFUL) throw new InvalidOperationException(ChangeError(apply));
            return true;
        }

        /// <summary>1 = only the main display, 2 = duplicate, 4 = extend, 8 = only the second display; 0 if unknown.</summary>
        public static int GetTopology()
        {
            uint np, nm;
            if (GetDisplayConfigBufferSizes(4 /* QDC_DATABASE_CURRENT */, out np, out nm) != 0 || np == 0) return 0;
            IntPtr paths = Marshal.AllocHGlobal((int)np * PathSize), modes = Marshal.AllocHGlobal((int)nm * ModeSize), topo = Marshal.AllocHGlobal(4);
            try
            {
                Marshal.WriteInt32(topo, 0, 0);
                if (QueryDisplayConfig(4, ref np, paths, ref nm, modes, topo) != 0) return 0;
                return Marshal.ReadInt32(topo, 0);
            }
            catch { return 0; }
            finally
            {
                Marshal.FreeHGlobal(paths);
                Marshal.FreeHGlobal(modes);
                Marshal.FreeHGlobal(topo);
            }
        }

        public static object SetTopology(int topology)
        {
            if (topology != 1 && topology != 2 && topology != 4 && topology != 8) throw new ArgumentException("unknown display mode");
            const uint SDC_APPLY = 0x80;
            int r = SetDisplayConfig(0, IntPtr.Zero, 0, IntPtr.Zero, (uint)topology | SDC_APPLY);
            if (r != 0) throw new InvalidOperationException("Windows could not change the display mode (" + r + ")");
            return true;
        }

        /* -------------------------------------------------------------- */
        /* Windows text and app size (DPI scale)                           */
        /* -------------------------------------------------------------- */

        static Dictionary<string, object> GetDpi(PathInfo p)
        {
            IntPtr pkt = Marshal.AllocHGlobal(32);
            try
            {
                Fill(pkt, GET_DPI_SCALE, 32, p.SrcLuid, p.SrcId);
                if (DisplayConfigGetDeviceInfo(pkt) != 0) return null;
                int min = Marshal.ReadInt32(pkt, 20), cur = Marshal.ReadInt32(pkt, 24), max = Marshal.ReadInt32(pkt, 28);
                int recommended = -min; // steps above 100 % that Windows recommends
                var values = new List<object>();
                for (int i = 0; i <= recommended + max && i < DpiSteps.Length; i++) values.Add(DpiSteps[i]);
                int idx = recommended + cur;
                if (idx < 0 || idx >= DpiSteps.Length) return null;
                return new Dictionary<string, object>
                {
                    { "current", DpiSteps[idx] },
                    { "recommended", DpiSteps[Math.Max(0, Math.Min(DpiSteps.Length - 1, recommended))] },
                    { "values", values },
                };
            }
            catch { return null; }
            finally { Marshal.FreeHGlobal(pkt); }
        }

        /// <summary>Windows' "Scale" for one display, in percent (100, 125, 150 ...).</summary>
        public static object SetDpi(string device, int percent)
        {
            device = Resolve(device);
            var p = Paths().FirstOrDefault(x => x.Gdi == device);
            if (p == null) throw new InvalidOperationException("Could not find that display");
            int target = Array.IndexOf(DpiSteps, percent);
            if (target < 0) throw new ArgumentException("unsupported scale");

            IntPtr pkt = Marshal.AllocHGlobal(32);
            try
            {
                Fill(pkt, GET_DPI_SCALE, 32, p.SrcLuid, p.SrcId);
                if (DisplayConfigGetDeviceInfo(pkt) != 0) throw new InvalidOperationException("This display does not allow changing the scale");
                int min = Marshal.ReadInt32(pkt, 20), max = Marshal.ReadInt32(pkt, 28);
                int recommended = -min;
                int rel = target - recommended;
                if (rel < min || rel > max) throw new InvalidOperationException("This display does not support that scale");
                Fill(pkt, SET_DPI_SCALE, 24, p.SrcLuid, p.SrcId);
                Marshal.WriteInt32(pkt, 20, rel);
                int r = DisplayConfigSetDeviceInfo(pkt);
                if (r != 0) throw new InvalidOperationException("Windows did not accept the scale (" + r + ")");
            }
            finally { Marshal.FreeHGlobal(pkt); }
            return true;
        }

        /* -------------------------------------------------------------- */
        /* Game colors                                                     */
        /* -------------------------------------------------------------- */

        // The gamma ramp is one curve per color channel, so it can change gamma,
        // contrast and brightness (of every GPU alike). Saturation is not a
        // curve: it is NVIDIA's "digital vibrance", see Vibrance below.
        static readonly HashSet<string> ColoredDevices = new HashSet<string>();

        static ushort[] Ramp(double gamma, double contrast, double brightness)
        {
            var ramp = new ushort[768];
            for (int i = 0; i < 256; i++)
            {
                double x = i / 255.0;
                x = (x - 0.5) * contrast + 0.5 + brightness;
                x = Math.Max(0.0, Math.Min(1.0, x));
                x = Math.Pow(x, 1.0 / gamma);
                ushort v = (ushort)Math.Round(Math.Max(0.0, Math.Min(1.0, x)) * 65535.0);
                ramp[i] = v;
                ramp[256 + i] = v;
                ramp[512 + i] = v;
            }
            return ramp;
        }

        static bool ApplyRamp(string device, ushort[] ramp)
        {
            IntPtr dc = CreateDC(null, device, null, IntPtr.Zero);
            if (dc == IntPtr.Zero) return false;
            try { return SetDeviceGammaRamp(dc, ramp); }
            finally { DeleteDC(dc); }
        }

        /// <summary>
        /// device: one display or empty for all. gamma 0.7-1.5 (1 = normal), contrast 0.7-1.3
        /// (1 = normal), brightness -0.15..0.15 (0 = normal), vibrance 0-100 (NVIDIA only, 0 = normal).
        /// Windows refuses curves that stray too far from a straight line, which is why the ranges are narrow.
        /// </summary>
        public static object SetColors(string device, double gamma, double contrast, double brightness, int vibrance)
        {
            gamma = Math.Max(0.7, Math.Min(1.5, gamma));
            contrast = Math.Max(0.7, Math.Min(1.3, contrast));
            brightness = Math.Max(-0.15, Math.Min(0.15, brightness));
            var ramp = Ramp(gamma, contrast, brightness);

            var targets = string.IsNullOrEmpty(device) ? AttachedDisplays().Select(a => a.Device).ToList() : new List<string> { device };
            int ok = 0;
            foreach (var t in targets)
            {
                if (ApplyRamp(t, ramp)) { ok++; ColoredDevices.Add(t); }
            }
            bool vib = Vibrance.Set(vibrance);
            if (ok == 0 && !vib) throw new InvalidOperationException("The graphics driver refused these colors");
            return new Dictionary<string, object> { { "displays", ok }, { "vibrance", vib } };
        }

        /// <summary>Back to normal colors on every display that was changed.</summary>
        public static object ResetColors()
        {
            var normal = Ramp(1.0, 1.0, 0.0);
            foreach (var d in ColoredDevices.ToList()) ApplyRamp(d, normal);
            ColoredDevices.Clear();
            Vibrance.Set(0);
            return true;
        }

        /// <summary>Called when the helper exits: the launcher's colors must not outlive it.</summary>
        public static void Restore()
        {
            try { if (ColoredDevices.Count > 0 || Vibrance.Changed) ResetColors(); } catch { }
        }

        // NVIDIA digital vibrance through nvapi64.dll. The entry points are looked
        // up by their NVAPI ids. Without an NVIDIA driver none of this exists and
        // Info() says so.
        static class Vibrance
        {
            [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr LoadLibrary(string name);
            [DllImport("kernel32.dll", CharSet = CharSet.Ansi)] static extern IntPtr GetProcAddress(IntPtr module, string name);
            [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate IntPtr QueryInterfaceFn(uint id);
            [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int InitializeFn();
            [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int EnumDisplayFn(uint index, out IntPtr handle);
            [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int SetDvcFn(IntPtr handle, uint output, int level);
            [UnmanagedFunctionPointer(CallingConvention.Cdecl)] delegate int GetDvcFn(IntPtr handle, uint output, ref DvcInfo info);

            [StructLayout(LayoutKind.Sequential)]
            struct DvcInfo { public uint Version; public int Current, Min, Max; }

            static bool tried, ready;
            static EnumDisplayFn enumDisplay;
            static SetDvcFn setDvc;
            static GetDvcFn getDvc;
            public static bool Changed;

            static void Load()
            {
                if (tried) return;
                tried = true;
                try
                {
                    IntPtr lib = LoadLibrary("nvapi64.dll");
                    if (lib == IntPtr.Zero) return;
                    IntPtr q = GetProcAddress(lib, "nvapi_QueryInterface");
                    if (q == IntPtr.Zero) return;
                    var query = (QueryInterfaceFn)Marshal.GetDelegateForFunctionPointer(q, typeof(QueryInterfaceFn));
                    IntPtr init = query(0x0150E828), enumFn = query(0x9ABDD40D), set = query(0x172409B4), get = query(0x4085DE45);
                    if (init == IntPtr.Zero || enumFn == IntPtr.Zero || set == IntPtr.Zero || get == IntPtr.Zero) return;
                    if (((InitializeFn)Marshal.GetDelegateForFunctionPointer(init, typeof(InitializeFn)))() != 0) return;
                    enumDisplay = (EnumDisplayFn)Marshal.GetDelegateForFunctionPointer(enumFn, typeof(EnumDisplayFn));
                    setDvc = (SetDvcFn)Marshal.GetDelegateForFunctionPointer(set, typeof(SetDvcFn));
                    getDvc = (GetDvcFn)Marshal.GetDelegateForFunctionPointer(get, typeof(GetDvcFn));
                    ready = true;
                }
                catch { ready = false; }
            }

            static List<IntPtr> Handles()
            {
                var list = new List<IntPtr>();
                for (uint i = 0; i < 16; i++)
                {
                    IntPtr h;
                    if (enumDisplay(i, out h) != 0) break;
                    list.Add(h);
                }
                return list;
            }

            public static object Info()
            {
                Load();
                int max = 0;
                if (ready)
                {
                    try
                    {
                        foreach (var h in Handles())
                        {
                            var info = new DvcInfo { Version = (uint)(Marshal.SizeOf(typeof(DvcInfo)) | (1 << 16)) };
                            if (getDvc(h, 0, ref info) == 0) { max = Math.Max(max, info.Max); break; }
                        }
                    }
                    catch { max = 0; }
                }
                return new Dictionary<string, object> { { "supported", max > 0 } };
            }

            /// <summary>0-100 on every NVIDIA display. False if there is none.</summary>
            public static bool Set(int percent)
            {
                Load();
                if (!ready) return false;
                percent = Math.Max(0, Math.Min(100, percent));
                bool any = false;
                try
                {
                    foreach (var h in Handles())
                    {
                        var info = new DvcInfo { Version = (uint)(Marshal.SizeOf(typeof(DvcInfo)) | (1 << 16)) };
                        if (getDvc(h, 0, ref info) != 0 || info.Max <= info.Min) continue;
                        int level = info.Min + (int)Math.Round((info.Max - info.Min) * percent / 100.0);
                        if (setDvc(h, 0, level) == 0) any = true;
                    }
                }
                catch { return false; }
                if (any && percent > 0) Changed = true;
                return any;
            }
        }

        /* -------------------------------------------------------------- */
        /* Variable refresh rate                                           */
        /* -------------------------------------------------------------- */

        // Windows' "Variable refresh rate" (Settings > System > Display > Graphics)
        // lives in this value as "VRROptimizeEnable=1;". It lets G-Sync / FreeSync
        // work for windowed and borderless games too. The driver's own switch for
        // fullscreen G-Sync / FreeSync is not touched here.
        const string VrrKey = @"Software\Microsoft\DirectX\UserGpuPreferences";
        const string VrrValue = "DirectXUserGlobalSettings";

        static Dictionary<string, string> ReadSettings()
        {
            var map = new Dictionary<string, string>();
            using (var k = Registry.CurrentUser.OpenSubKey(VrrKey))
            {
                var raw = k == null ? null : k.GetValue(VrrValue) as string;
                if (raw == null) return map;
                foreach (var part in raw.Split(new[] { ';' }, StringSplitOptions.RemoveEmptyEntries))
                {
                    int eq = part.IndexOf('=');
                    if (eq > 0) map[part.Substring(0, eq).Trim()] = part.Substring(eq + 1).Trim();
                }
            }
            return map;
        }

        public static object GetVrr()
        {
            string v;
            bool on = ReadSettings().TryGetValue("VRROptimizeEnable", out v) && v == "1";
            // The option exists from Windows 10 version 1903 (build 18362) on.
            bool supported = Environment.OSVersion.Version.Major >= 10 && Environment.OSVersion.Version.Build >= 18362;
            return new Dictionary<string, object> { { "supported", supported }, { "on", on } };
        }

        public static object SetVrr(bool on)
        {
            var map = ReadSettings();
            map["VRROptimizeEnable"] = on ? "1" : "0";
            var text = string.Join("", map.Select(kv => kv.Key + "=" + kv.Value + ";").ToArray());
            using (var k = Registry.CurrentUser.CreateSubKey(VrrKey))
            {
                if (k == null) throw new InvalidOperationException("Windows did not allow changing this");
                k.SetValue(VrrValue, text, RegistryValueKind.String);
            }
            return true;
        }
    }
}
