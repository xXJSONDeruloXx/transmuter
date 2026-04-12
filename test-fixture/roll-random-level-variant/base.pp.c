extern u8 *gGameFlags;
u32 thunk_FUN_080002a0(void);
u32 FUN_0805193c(u8, u32);

void RollRandomLevelVariant(void) {
    u8 *state = gGameFlags;
    u8 difficulty = state[0x0C];
    register u32 d asm("r4") = (u8)(difficulty - 1);
    u32 rng;
    u32 addr = 0x03004C20;
    register u8 *levelState asm("r6");
    register u32 parity asm("r5");
    u8 randByte;
    u32 variant;
    rng = thunk_FUN_080002a0();
    asm("" : "=r"(levelState) : "0"(addr));
    parity = 1;
    parity &= d;
    randByte = (u8)rng;
    rng = (u8)d;
    variant = FUN_0805193c(randByte, 5 - rng);
    parity = parity + variant + 1;
    levelState[0x0E] = parity;
}

