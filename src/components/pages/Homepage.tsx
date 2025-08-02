import Dropdown from '../justComponents/Dropdown';
import student from "../../assets/student.png";
import bgmiHashOne from "../../assets/bgmiHashOne.png";
import { TypeAnimation } from 'react-type-animation';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../reduxToolkit/Store';
import { increment } from '../../reduxToolkit/features/counterSlice';

function Homepage() {
    const count = useSelector((state: RootState) => state.counter.value);
    const dispatch = useDispatch();
    console.log(count);
    return (
        <>
            <div className="items-center mb-5 sm:min-h-[100vh] sm:flex justify-around text-center">
                <div className="flex flex-col items-center mb-6">
                    <img
                        className="sm:h-[27rem] h-[10rem] rounded-[0rem] mb-5"
                        src={student}
                        alt="Profile"
                    />
                    <h1 onClick={() => dispatch(increment())} className="select-none text-3xl font-bold text-gray-800 mt-4">
                        <TypeAnimation
                            sequence={[
                                "Sahith...",
                                1000,
                                "Student",
                                1000,
                            ]}
                            wrapper="span"
                            speed={8}
                            className="text-purple-600 font-amita"
                            repeat={Infinity}
                        />
                    </h1>
                </div>
                <div className="sm:text-left">
                    <div className="text-[3rem] font-amita">Hello,</div>
                    <div className="text-[3rem] font-amita">This is <span className="text-orange-500 ">Sahith</span></div>
                    <div className="text-[3rem] font-amita">Into Tech? </div>
                    <Dropdown />
                </div>
            </div>
            <div className='flex justify-center'>
                <img
                    className="sm:h-[23rem] rounded-[0rem] mb-10"
                    src={bgmiHashOne}
                    alt="Profile"
                />
            </div>
        </>
    );
}

export default Homepage