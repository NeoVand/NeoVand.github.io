/**
 * Created by Neo on 12/12/2016.
 */
function gamepadControl() {
    var gamepad;
    if (navigator.getGamepads()[0]) {
        var gamepads = navigator.getGamepads();
        gamepad = gamepads[0];
//            console.log(gamepad);
    }
    if (gamepad) {
        var ax0 = gamepad.axes[0];
        var ax1 = gamepad.axes[1];
        var ax2 = gamepad.axes[2];
        var ax3 = gamepad.axes[3];
        var b0 = gamepad.buttons[0].pressed;
        var b1 = gamepad.buttons[1].pressed;
        var b2 = gamepad.buttons[2].pressed;

        var b4 = gamepad.buttons[4].pressed;
        var b4r = gamepad.buttons[4].released;

        var b5 = gamepad.buttons[5].pressed;
        var b6 = gamepad.buttons[6].value;
        var b7 = gamepad.buttons[7].value;
        var b8 = gamepad.buttons[8].value;
        var b12 = gamepad.buttons[12].value;
        var b13 = gamepad.buttons[13].value;
    }
    if (Math.abs(ax3) > 0.1 && b7 == 0) {
        var dir = camera.getWorldDirection();
        group.position.x -= (ax3 / 0.5) * dir.x;
        group.position.z -= (ax3 /0.5) * dir.z;
        group.position.y -= (ax3 / 0.5) * dir.y;

//            camera.translateZ( (ax3/50) );

    }
    else if (Math.abs(ax3) > 0.1 && b7 > 0) {
        group.scale.x += b7 * (ax3 / 30);
        group.scale.y += b7 * (ax3 / 30);
        group.scale.z += b7 * (ax3 / 30);
    }

    if (Math.abs(ax0) + Math.abs(ax1) > 0.1) {
        var dir = camera.getWorldDirection().normalize();

//            pivot.translate( neuralNet.meshComponents.position.x-camera.position.x, neuralNet.meshComponents.position.y-camera.position.y, neuralNet.meshComponents.position.z-camera.position.z );

//            neuralNet.meshComponents.rotation.y+=((Math.abs(ax1) <= 0.1 ? 0 : ax1)/30);

        group.rotation.x -= (Math.sign(dir.z) * b6 * (Math.abs(ax1) <= 0.1 ? 0 : ax1) / 90);
        group.rotation.y += (b6 * (Math.abs(ax0) <= 0.1 ? 0 : ax0) / 90);

//            neuralNet.meshComponents.position.z-=(dir.x*(Math.abs(ax1)<= 0.05 ? 0 : ax0)/30);
//            neuralNet.meshComponents.position.x+=(-dir.y*(Math.abs(ax0)<= 0.05 ? 0 : ax1)/30);


//            neuralNet.meshComponents.rotation.z-=(ax0/30)*dir.x;
    }

    if (Math.abs(ax1) > 0.1 && b6 < 1.) {
        group.position.y -= (ax1 / 0.5);
    }
    if (Math.abs(ax0) > 0.1 && b6 <1.) {
        console.log('happened');
        var dir = camera.getWorldDirection().normalize();
        group.position.z += (ax0/0.5) * dir.x;
        group.position.x -= (ax0/0.5) * dir.z;
    }
}