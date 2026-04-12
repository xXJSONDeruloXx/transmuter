s16 FixedMul8(s16 a, s16 b) {
    s32 result = (s32)a * (s32)b;
    register s32 shifted asm("r1") = result;
    if (result < 0)
        shifted += 0xFF;
    return (s16)(shifted >> 8);
}
