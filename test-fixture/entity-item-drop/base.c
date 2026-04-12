extern const s16 gEntityAnimTable[];
extern const u8 gItemDropParamTable[];

void EntityItemDrop(u8 arg0) {
    u32 shifted = (u32)arg0 << 24;
    register u32 slot asm("r4") = shifted >> 24;
    register u8 itemType asm("r5") = (shifted + ((u32)0xE4 << 24)) >> 24;
    u8 *base;
    register u8 *entity asm("r3");
    register u32 shl3 asm("r2");
    register u32 offs asm("r1");
    u8 state;
    register u8 *arrayBase asm("r12");

    asm("" : "=r"(slot) : "0"(slot));

    if (gGameFlagsPtr[0x0A] == 1) {
        u8 *b;
        u8 *e;
        u8 zero;

        b = gEntityArray;
        e = b + ((slot << 3) - slot) * 4;
        zero = 0;
        e[0x10] = zero;
        e[0x0F] = 0x1C;
        return;
    }

    base = gEntityArray;
    shl3 = slot << 3;
    offs = (shl3 - slot) << 2;
    entity = (u8 *)(offs + (u32)base);
    arrayBase = base;
    state = entity[0x0F];

    switch (state) {
        case 3: {
            u8 one;
            u8 zero;
            register u8 *ent asm("r1");
            u32 dir;
            register u32 yp asm("r0");
            register u8 *tbl asm("r2");
            register u32 idx asm("r3");

            zero = 0;
            entity[0x0F] = zero;
            one = 1;
            *(u16 *)(entity + 0x14) = zero;
            entity[0x10] = one;
            entity[0x0C] = (one - 5) & entity[0x0C];

            dir = *(u8 *)(arrayBase + 0x204);
            dir = (dir << 0x1C) >> 0x1E;
            if (dir == 0) {
                u16 xp = *(u16 *)(arrayBase + 0x1F8);
                xp += 0x10;
                *(u16 *)(entity) = xp;
            } else {
                u16 xp = *(u16 *)(arrayBase + 0x1F8);
                xp -= 0x10;
                *(u16 *)(entity) = xp;
            }

            ent = arrayBase + (shl3 - slot) * 4;
            yp = 0xFD;
            yp <<= 1;
            yp += (u32)arrayBase;
            *(u16 *)(ent + 0x02) = *(u16 *)yp;

            tbl = (u8 *)gItemDropParamTable;
            idx = (u32)itemType << 1;
            ent[0x08] = *((u8 *)(idx + (u32)tbl));
            tbl++;
            idx = idx + (u32)tbl;
            ent[0x16] = 4;
            ent[0x09] = *(u8 *)idx;
            break;
        }

        case 4: {
            u8 one;
            u8 zero;
            register u8 *ent asm("r1");
            u32 dir;
            register u32 yp asm("r0");
            register u8 *tbl asm("r2");
            register u32 idx asm("r3");
            u8 *tblA;

            zero = 0;
            entity[0x0F] = zero;
            one = 1;
            *(u16 *)(entity + 0x14) = zero;
            entity[0x10] = one;
            entity[0x0C] = (one - 5) & entity[0x0C];

            dir = *(u8 *)(arrayBase + 0x204);
            dir = (dir << 0x1C) >> 0x1E;
            if (dir == 0) {
                u16 xp = *(u16 *)(arrayBase + 0x1F8);
                xp += 0x10;
                *(u16 *)(entity) = xp;
            } else {
                u16 xp = *(u16 *)(arrayBase + 0x1F8);
                xp -= 0x10;
                *(u16 *)(entity) = xp;
            }

            ent = arrayBase + (shl3 - slot) * 4;
            yp = 0xFD;
            yp <<= 1;
            yp += (u32)arrayBase;
            *(u16 *)(ent + 0x02) = *(u16 *)yp;

            tbl = (u8 *)gItemDropParamTable;
            idx = (u32)itemType << 1;
            tblA = (u8 *)((u32)tbl + 0x0A);
            ent[0x08] = *((u8 *)(idx + (u32)tblA));
            tbl += 0x0B;
            idx = idx + (u32)tbl;
            ent[0x16] = 2;
            ent[0x09] = *(u8 *)idx;
            break;
        }

        case 0: {
            register s32 amplitude asm("r2") = 0x09;
            register s16 *sineTable asm("r1");
            s32 sineVal;
            s32 yOffset;
            register s32 amp asm("r1");
            register u32 baseY asm("r2");
            register u32 result asm("r0");
            s8 xVel;
            u16 xPos;
            u8 step;
            u16 phase;
            u32 nextPhase;

            amplitude = ((s8 *)entity)[amplitude];
            sineTable = gEntityAnimTable;

            sineVal = sineTable[*(u16 *)(entity + 0x14)];

            yOffset = ((s32)amplitude * sineVal) >> 8;
            baseY = 0x86;
            baseY <<= 1;
            *(u16 *)(entity + 0x02) = (u16)(baseY - yOffset);

            xVel = ((s8 *)entity)[0x08];
            xPos = *(u16 *)(entity);
            *(u16 *)(entity) = (u16)(xVel + xPos);

            step = entity[0x16];
            phase = *(u16 *)(entity + 0x14);
            nextPhase = (u32)phase + step;
            *(u16 *)(entity + 0x14) = nextPhase;
            if ((u16)nextPhase == 0x88) {
                entity[0x0F] = 0x1C;
                entity[0x10] = 0;
            }
            break;
        }

        default:
            break;
    }
}
