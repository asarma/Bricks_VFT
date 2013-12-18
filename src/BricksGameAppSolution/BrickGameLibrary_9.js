/* global onMouseMove x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 

//Task #1 - V1 (incorrect variant)
/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 11-09-2013               *
* @Description: changed polygon dimensions    *
* *********************************************/

//*********************************************
//Action: paddle1
//*********************************************
   ctx.beginPath();  
   polygon(ctx,paddlex,HEIGHT-20 - paddleh,paddlew-15,7,Math.PI/2);
   ctx.closePath();
   ctx.fillStyle="rgba(127,11,93,0.75)";
   ctx.fill();
   ctx.stroke();


//Task #2 - V2 (incorrect variant)
/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 21-05-2013               *
* @Description: Added the closePath() method  *
* *********************************************/

//*********************************************
//Action: shape2
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.8 * Math.PI/3, 1.4 * Math.PI, false);
   ctx.fillStyle='rgba(0, 0, 0, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();