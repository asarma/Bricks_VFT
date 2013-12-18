/* global onMouseMove x:true y:true dx:true dy:true ctx d ballr paddleh paddlex paddlew rowheight:true colwidth:true  bricks BRICKHEIGHT PADDING BRICKWIDTH NROWS WIDTH HEIGHT intervalId polygon */ 



/**********************************************
* @Author:Johnson                             *
* @Last-Update-Date: 11-15-2013               *
* @Description: Added the fill() method       *
* *********************************************/

//*********************************************
//Action: paddle
//*********************************************

    ctx.beginPath();  
    ctx.rect(x-30, y+10, paddlew+40, paddleh-15);
    ctx.closePath();
    ctx.fillStyle='rgba(0, 1, 0, 1)';
    ctx.fill();
    ctx.stroke();
 
 

/**********************************************
* @Author:Smith                               *
* @Last-Update-Date: 11-15-2013               *
* @Description: Added the beginPath() method  *
* *********************************************/

//*********************************************
//Action: shape
//*********************************************

   ctx.beginPath();  
   ctx.arc(x, y, d, 1.1 * Math.PI, 1.9 * Math.PI, false);
   ctx.fillStyle='rgba(0, 0, 0, 1)';
   ctx.closePath();
   ctx.fill();
   ctx.stroke();
   
   
   
/*****************************************************
* @Author:Johnson                                    *
* @Last-Update-Date: 08-12-2013                      *
* @Description: Added the change for row calculation *
* ****************************************************/

//*********************************************
//Action: bounce
//*********************************************

   //collison detection
   var rowheight = BRICKHEIGHT + PADDING;
   var colwidth = BRICKWIDTH + PADDING;
   var row = Math.floor(y*rowheight);
   var col = Math.floor(x*colwidth);
  
  //reverse the ball and mark the brick as broken
  if (y < NROWS * rowheight && row >= 0 && col >= 0 && bricks[row][col] == 1) {
    dy = -dy*dx;
    bricks[row][col] = 0;
  }