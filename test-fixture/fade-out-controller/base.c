void UpdateBGScrollRegisters(void);
void m4aSoundVSyncOff(void);
void m4aMPlayAllStop(void);
void UpdateSceneTransition(void);

void FadeOutController(void) {
    u32 *sceneCtrl = (u32 *)0x03004C20;
    u32 fadeTimer;
    u8 *fadeCounter;

    if (sceneCtrl[0] == 0)
        UpdateBGScrollRegisters();

    fadeCounter = (u8 *)0x03005498;
    fadeTimer = *(vu32 *)sceneCtrl;

    if (fadeTimer > 0x0F)
        *fadeCounter = (fadeTimer - 0x10) >> 1;

    if (*fadeCounter > 0x0F) {
        gCallbackStateArray[1] = (u32)UpdateSceneTransition;
        sceneCtrl[0] = (u32)-1;
    }

    m4aMPlayAllStop();
    m4aSoundVSyncOff();
}
